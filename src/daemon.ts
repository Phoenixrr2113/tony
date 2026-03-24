import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { getSchedule, isWithinActiveHours } from "./lib/schedule.ts";
import { wake } from "./wake.ts";
import type { WakeResult } from "./wake.ts";
import { join } from "path";
import { ROOT, SIGNAL_PAUSE_PATH, LOCATION_PATH } from "./lib/paths.ts";
import { pollTelegramMessages, sendTelegramMessage, type TelegramMessage } from "./lib/telegram.ts";
import { writeMessagesToInbox } from "./lib/messaging.ts";
import { getActiveQuery, isSessionRunning } from "./lib/session.ts";
import { getNextDueBrief, msUntilNextBrief, getTimezone, getTodayKey } from "./lib/scheduler.ts";
import type { BriefType } from "./lib/briefs.ts";
import { checkLocationReminders, checkTimeReminders, markFired } from "./lib/geo.ts";
import { getUpcomingEvents, type UpcomingEvent } from "./lib/prewake.ts";

const SCHEDULE_REQUEST_PATH = join(ROOT, "mind", "schedule-request.json");
const TELEGRAM_POLL_INTERVAL_MS = 5_000;
const CALENDAR_CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// --- Error Recovery ---
const BACKOFF_STEPS = [5, 30, 120, 600, 1800]; // seconds: 5s → 30s → 2m → 10m → 30m
const CONSECUTIVE_FAILURE_ALERT = 3; // alert Randy after this many
const CIRCUIT_BREAKER_THRESHOLD = 5; // failures in 1 hour → hibernation
const CIRCUIT_BREAKER_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const HIBERNATION_CHECK_MS = 30 * 60 * 1000; // check every 30m in hibernation

let consecutiveFailures = 0;
let failureTimestamps: number[] = [];
let isHibernating = false;

// Calendar alert tracking
const firedCalendarAlerts = new Set<string>(); // "title|HH:MM" keys alerted today
let lastCalendarCheckMs = 0;
let pendingCalendarAlert: UpcomingEvent | null = null;

function getBackoffDelay(): number {
  const idx = Math.min(consecutiveFailures - 1, BACKOFF_STEPS.length - 1);
  return BACKOFF_STEPS[Math.max(0, idx)];
}

function recordFailure(): void {
  consecutiveFailures++;
  const now = Date.now();
  failureTimestamps.push(now);
  failureTimestamps = failureTimestamps.filter(t => now - t < CIRCUIT_BREAKER_WINDOW_MS);
}

function resetFailures(): void {
  consecutiveFailures = 0;
}

function shouldTripCircuitBreaker(): boolean {
  const now = Date.now();
  const recentFailures = failureTimestamps.filter(t => now - t < CIRCUIT_BREAKER_WINDOW_MS);
  return recentFailures.length >= CIRCUIT_BREAKER_THRESHOLD;
}

async function alertRandy(message: string): Promise<void> {
  console.error(`🚨 ${message}`);
  try {
    await sendTelegramMessage(`⚠️ *Edith Alert*\n\n${message}`);
  } catch {
    console.error(`   (Telegram alert failed too)`);
  }
}

async function checkGraphitiHealth(): Promise<boolean> {
  try {
    const res = await fetch("http://localhost:8000/", { signal: AbortSignal.timeout(3000) });
    return true;
  } catch {
    return false;
  }
}

function isRateLimitError(err: any): boolean {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  return msg.includes("rate limit") || msg.includes("429") || msg.includes("too many requests");
}

/**
 * Inject a Telegram message into the running session via streamInput().
 */
async function injectMessage(messages: TelegramMessage[]): Promise<boolean> {
  const q = getActiveQuery();
  if (!q) return false;

  try {
    const body = messages
      .map((m) => {
        const source = m.source === "sms" ? "SMS" : "Telegram";
        return `[${source} from ${m.from} at ${m.date.toISOString()}]\n${m.text}`;
      })
      .join("\n\n");

    const formatted = `⚡ Incoming message while you're mid-session:\n\n${body}\n\nRespond to this message, then continue what you were working on before it arrived.`;

    async function* messageStream() {
      yield {
        type: "user" as const,
        message: {
          role: "user" as const,
          content: formatted,
        },
        parent_tool_use_id: null,
        session_id: "",
      };
    }

    await q.streamInput(messageStream());
    console.log(`   💉 Injected ${messages.length} message(s) into running session`);
    return true;
  } catch (err) {
    console.error(`   ⚠️  streamInput failed, falling back to inbox:`, err instanceof Error ? err.message : err);
    return false;
  }
}

let caffeinateProc: ReturnType<typeof Bun.spawn> | null = null;
let isWakeRunning = false;
let isPaused = false;
let interruptSleep: (() => void) | null = null;
let pendingMessageWake = false;

const WAKE_KEYWORDS = ["wake up", "come back", "resume", "hey edith", "wake edith", "start up"];

function checkPauseSignal(): boolean {
  if (!existsSync(SIGNAL_PAUSE_PATH)) return false;
  try {
    const signal = JSON.parse(readFileSync(SIGNAL_PAUSE_PATH, "utf-8"));
    if (signal.until === "resume") {
      console.log(`⏸️  Pause signal detected — Edith going quiet until "wake up" message`);
      return true;
    }
  } catch {}
  return false;
}

function consumePauseSignal(): void {
  try { unlinkSync(SIGNAL_PAUSE_PATH); } catch {}
}

function isWakeUpMessage(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return WAKE_KEYWORDS.some(kw => lower.includes(kw));
}

// --- Location expiry tracking ---
let locationExpiryWarned = false;

/**
 * Process any triggered location or time reminders.
 * Sends them via Telegram and marks as fired.
 */
async function processTriggeredReminders(): Promise<void> {
  // Location reminders
  const locTriggered = checkLocationReminders();
  for (const { reminder, locationLabel } of locTriggered) {
    const msg = `📍 *Reminder* (near ${locationLabel})\n\n${reminder.text}`;
    await sendTelegramMessage(msg);
    console.log(`📍 Location reminder fired: "${reminder.text}" (near ${locationLabel})`);
  }
  if (locTriggered.length > 0) {
    markFired(locTriggered.map(t => t.reminder.id));
  }

  // Time reminders
  const timeTriggered = checkTimeReminders();
  for (const reminder of timeTriggered) {
    const msg = `⏰ *Reminder*\n\n${reminder.text}`;
    await sendTelegramMessage(msg);
    console.log(`⏰ Time reminder fired: "${reminder.text}"`);
  }
  if (timeTriggered.length > 0) {
    markFired(timeTriggered.map(r => r.id));
  }
}

async function checkLocationExpiry(): Promise<void> {
  if (!existsSync(LOCATION_PATH)) return;
  try {
    const loc = JSON.parse(readFileSync(LOCATION_PATH, "utf-8"));
    if (!loc.expiresAt) return;

    const expiresAt = new Date(loc.expiresAt).getTime();
    const now = Date.now();
    const minutesLeft = (expiresAt - now) / (1000 * 60);

    if (minutesLeft <= 10 && minutesLeft > 0 && !locationExpiryWarned) {
      locationExpiryWarned = true;
      await sendTelegramMessage(`📍 Location sharing expires in ${Math.round(minutesLeft)} minutes. Want to extend?`);
      console.log(`📍 Location expiry warning sent (${Math.round(minutesLeft)}m left)`);
    } else if (minutesLeft > 10) {
      locationExpiryWarned = false;
    }
  } catch {}
}

function startCaffeinate() {
  try {
    caffeinateProc = Bun.spawn(["caffeinate", "-i"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    console.log(`☕ caffeinate started (pid ${caffeinateProc.pid}) — preventing idle sleep`);
  } catch {
    console.warn("⚠️  caffeinate not available — system may sleep");
  }
}

function stopCaffeinate() {
  if (caffeinateProc) {
    caffeinateProc.kill();
    caffeinateProc = null;
    console.log("☕ caffeinate stopped");
  }
}

function interruptibleSleep(ms: number): Promise<"completed" | "interrupted"> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      interruptSleep = null;
      resolve("completed");
    }, ms);

    interruptSleep = () => {
      clearTimeout(timer);
      interruptSleep = null;
      resolve("interrupted");
    };
  });
}

async function startTelegramPoller() {
  console.log(`📡 Telegram poller started (every ${TELEGRAM_POLL_INTERVAL_MS / 1000}s)`);

  while (true) {
    await Bun.sleep(TELEGRAM_POLL_INTERVAL_MS);

    await checkLocationExpiry();
    await processTriggeredReminders();

    // Calendar proximity check — every 15 minutes
    const now = Date.now();
    if (now - lastCalendarCheckMs >= CALENDAR_CHECK_INTERVAL_MS) {
      lastCalendarCheckMs = now;
      try {
        const upcoming = getUpcomingEvents(60);
        for (const evt of upcoming) {
          const key = `${evt.title}|${evt.startTime}`;
          if (!firedCalendarAlerts.has(key)) {
            firedCalendarAlerts.add(key);
            console.log(`📅 Upcoming event in ${evt.minutesAway}m: "${evt.title}" — waking Edith`);
            pendingCalendarAlert = evt;
            if (interruptSleep) interruptSleep();
            break; // Wake once per check; next check will catch remaining events
          }
        }
      } catch (err) {
        console.error(`⚠️  Calendar alert check failed:`, err instanceof Error ? err.message : err);
      }
    }

    try {
      const messages = await pollTelegramMessages();
      if (messages.length === 0) continue;

      console.log(`📬 ${messages.length} Telegram message(s) from Randy`);

      // When paused, only respond to wake-up messages
      if (isPaused) {
        const hasWakeUp = messages.some(m => isWakeUpMessage(m.text));
        if (hasWakeUp) {
          console.log(`   ▶️  Wake-up message detected — resuming Edith`);
          isPaused = false;
          writeMessagesToInbox(messages);
        } else {
          console.log(`   ⏸️  Edith is paused — ignoring (say "wake up" to resume)`);
        }
        continue;
      }

      if (isWakeRunning && isSessionRunning()) {
        // Try to inject directly into running session
        const injected = await injectMessage(messages);
        if (!injected) {
          writeMessagesToInbox(messages);
          console.log(`   📥 Queued to inbox (injection failed)`);
        }
      } else if (isWakeRunning) {
        writeMessagesToInbox(messages);
        console.log(`   ⏳ Edith is starting up — queued to inbox`);
      } else {
        // Edith is idle — write to inbox and trigger immediate message-wake
        writeMessagesToInbox(messages);
        pendingMessageWake = true;
        console.log(`   🔔 Edith is idle — triggering message wake`);
        if (interruptSleep) {
          interruptSleep();
        }
      }
    } catch (err) {
      console.error(`❌ Telegram poll error:`, err instanceof Error ? err.message : err);
    }
  }
}

/**
 * Run a single wake session with error handling.
 * Returns the WakeResult or null on error.
 */
async function runSession(
  reason: string,
  briefType: BriefType,
  opts: { messageText?: string; locationName?: string; reminderText?: string } = {}
): Promise<{ result: WakeResult | null; error: Error | null }> {
  const graphitiUp = await checkGraphitiHealth();
  if (!graphitiUp) {
    console.log(`   ⚠️  Graphiti not reachable — will skip graphiti-memory MCP`);
  }

  isWakeRunning = true;
  let result: WakeResult | null = null;
  let error: Error | null = null;

  try {
    result = await wake(reason, {
      skipGraphiti: !graphitiUp,
      briefType,
      ...opts,
    });
  } catch (err) {
    error = err instanceof Error ? err : new Error(String(err));
    console.error("❌ Wake failed:", error.message);
  }

  isWakeRunning = false;
  return { result, error };
}

/**
 * Handle error recovery after a failed session.
 * Returns true if the loop should continue (skip normal post-session logic).
 */
async function handleSessionError(error: Error | null, result: WakeResult | null): Promise<boolean> {
  if (!error && !(result && result.exitCode !== 0 && !result.idleKilled)) {
    // Success
    if (consecutiveFailures > 0) {
      console.log(`✅ Recovery: session succeeded after ${consecutiveFailures} failure(s)`);
    }
    resetFailures();
    return false;
  }

  recordFailure();
  const errMsg = error?.message ?? `exit code ${result?.exitCode}`;

  if (isRateLimitError(error)) {
    const backoff = getBackoffDelay();
    await alertRandy(`Rate limited. Backing off for ${backoff}s.`);
    await Bun.sleep(backoff * 1000);
    return true;
  }

  if (consecutiveFailures >= CONSECUTIVE_FAILURE_ALERT && consecutiveFailures === CONSECUTIVE_FAILURE_ALERT) {
    await alertRandy(`Edith has failed ${consecutiveFailures} times in a row: ${errMsg}`);
  }

  if (shouldTripCircuitBreaker()) {
    isHibernating = true;
    await alertRandy(`Circuit breaker tripped. Hibernating — will retry every 30m.`);
    return true;
  }

  const backoff = getBackoffDelay();
  console.log(`⏳ Backoff: ${backoff}s (${consecutiveFailures} consecutive failure(s))`);
  await Bun.sleep(backoff * 1000);
  return true;
}

async function eventLoop() {
  const schedule = getSchedule();

  console.log(`\n🧠 Edith daemon starting (event-driven)`);
  console.log(`   Timezone: ${getTimezone()}`);
  console.log(`   Max turns/session: ${schedule.agent?.maxTurns ?? 100}`);
  console.log(`   Memory limit: ${schedule.needs?.memoryCharLimit ?? 8000} chars\n`);

  startCaffeinate();
  startTelegramPoller();

  // Track which briefs have fired today
  const tz = getTimezone();
  let currentDay = getTodayKey(tz);
  let firedToday = new Set<string>();
  let sessionCount = 0;

  // Boot session — run a full morning brief on startup
  {
    sessionCount++;
    console.log(`${"─".repeat(60)}`);
    console.log(`🔄 Boot session #${sessionCount} — ${new Date().toISOString()}`);

    const { result, error } = await runSession("boot", "boot");
    const shouldSkip = await handleSessionError(error, result);
    if (!shouldSkip && result) {
      if (checkPauseSignal()) {
        isPaused = true;
        consumePauseSignal();
        console.log(`⏸️  Edith is paused. Waiting for "wake up" message...`);
        while (isPaused) {
          await Bun.sleep(5_000);
        }
        console.log(`▶️  Edith resuming from pause`);
      }
    }
  }

  // Main event loop
  while (true) {
    // Day rollover — reset fired briefs and calendar alerts
    const today = getTodayKey(tz);
    if (today !== currentDay) {
      currentDay = today;
      firedToday = new Set<string>();
      firedCalendarAlerts.clear();
      console.log(`📅 New day: ${today}`);
    }

    // Circuit breaker hibernation
    if (isHibernating) {
      console.log(`🔌 Circuit breaker: hibernating. Checking in 30m...`);
      await Bun.sleep(HIBERNATION_CHECK_MS);
      isHibernating = false;
      console.log(`🔌 Circuit breaker: attempting recovery...`);
      continue;
    }

    // Check for active hours
    if (!isWithinActiveHours()) {
      const now = new Date().toLocaleTimeString("en-US", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      console.log(`😴 ${now} — Outside active hours. Checking in 5m...`);
      await Bun.sleep(300_000);
      continue;
    }

    // Check if a scheduled brief is due
    const dueBrief = getNextDueBrief(firedToday);
    if (dueBrief) {
      sessionCount++;
      firedToday.add(dueBrief.name);
      console.log(`${"─".repeat(60)}`);
      console.log(`📋 Brief: ${dueBrief.name} (${dueBrief.type}) — Session #${sessionCount}`);

      const { result, error } = await runSession(`brief-${dueBrief.name}`, dueBrief.type as BriefType);
      const shouldSkip = await handleSessionError(error, result);
      if (!shouldSkip && result) {
        if (checkPauseSignal()) {
          isPaused = true;
          consumePauseSignal();
          console.log(`⏸️  Edith is paused. Waiting for "wake up" message...`);
          while (isPaused) {
            await Bun.sleep(5_000);
          }
          console.log(`▶️  Edith resuming from pause`);
        }
      }
      continue;
    }

    // Check if a calendar alert triggered a wake
    if (pendingCalendarAlert) {
      const evt = pendingCalendarAlert;
      pendingCalendarAlert = null;
      sessionCount++;
      console.log(`${"─".repeat(60)}`);
      console.log(`📅 Calendar alert wake — "${evt.title}" in ${evt.minutesAway}m — Session #${sessionCount}`);

      const alertPrompt = `⚠️ Upcoming calendar event in ${evt.minutesAway} minutes: **${evt.title}** at ${evt.startTime} [${evt.calendar}].\n\nNotify Randy and check if any prep is needed.`;
      const { result, error } = await runSession("calendar-alert", "message", { messageText: alertPrompt });
      await handleSessionError(error, result);
      continue;
    }

    // Check if a message triggered a wake
    if (pendingMessageWake) {
      pendingMessageWake = false;
      sessionCount++;
      console.log(`${"─".repeat(60)}`);
      console.log(`💬 Message wake — Session #${sessionCount}`);

      // For message wakes, use a boot-style brief since messages are already in inbox
      const { result, error } = await runSession("message", "boot");
      const shouldSkip = await handleSessionError(error, result);
      if (!shouldSkip && result) {
        if (checkPauseSignal()) {
          isPaused = true;
          consumePauseSignal();
          console.log(`⏸️  Edith is paused. Waiting for "wake up" message...`);
          while (isPaused) {
            await Bun.sleep(5_000);
          }
          console.log(`▶️  Edith resuming from pause`);
        }
      }
      continue;
    }

    // Nothing to do — sleep until next brief or message interrupt
    const sleepMs = msUntilNextBrief(firedToday);
    const sleepMinutes = Math.round(sleepMs / 60000);
    console.log(`💤 Nothing due. Sleeping ${sleepMinutes}m (or until message)...`);

    const sleepResult = await interruptibleSleep(sleepMs);
    if (sleepResult === "interrupted") {
      console.log(`🔔 Sleep interrupted — checking events`);
    }
  }
}

function getRestartDelay(defaultDelay: number): number {
  if (!existsSync(SCHEDULE_REQUEST_PATH)) return defaultDelay;

  try {
    const request = JSON.parse(readFileSync(SCHEDULE_REQUEST_PATH, "utf-8"));
    unlinkSync(SCHEDULE_REQUEST_PATH);

    if (request.restartDelaySeconds !== undefined) {
      const delay = Math.max(0, Math.min(3600, request.restartDelaySeconds));
      console.log(`📋 Schedule request: restart in ${delay}s (reason: ${request.reason ?? "none"})`);
      return delay;
    }
  } catch {
    try { unlinkSync(SCHEDULE_REQUEST_PATH); } catch {}
  }

  return defaultDelay;
}

process.on("SIGINT", () => {
  stopCaffeinate();
  console.log("\n\n💀 Edith daemon stopped.\n");
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopCaffeinate();
  console.log("\n\n💀 Edith daemon stopped.\n");
  process.exit(0);
});

eventLoop();
