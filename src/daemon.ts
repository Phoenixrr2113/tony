import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { getSchedule, isWithinActiveHours } from "./lib/schedule.ts";
import { wake } from "./wake.ts";
import type { WakeResult } from "./wake.ts";
import { join } from "path";
import { ROOT, SIGNAL_PAUSE_PATH, LOCATION_PATH } from "./lib/paths.ts";
import { pollTelegramMessages, sendTelegramMessage, type TelegramMessage } from "./lib/telegram.ts";
import { writeMessagesToInbox } from "./lib/messaging.ts";
import { getActiveQuery, isSessionRunning } from "./lib/session.ts";

const SCHEDULE_REQUEST_PATH = join(ROOT, "mind", "schedule-request.json");
const TELEGRAM_POLL_INTERVAL_MS = 5_000;

// --- Error Recovery ---
const BACKOFF_STEPS = [5, 30, 120, 600, 1800]; // seconds: 5s → 30s → 2m → 10m → 30m
const CONSECUTIVE_FAILURE_ALERT = 3; // alert Randy after this many
const CIRCUIT_BREAKER_THRESHOLD = 5; // failures in 1 hour → hibernation
const CIRCUIT_BREAKER_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const HIBERNATION_CHECK_MS = 30 * 60 * 1000; // check every 30m in hibernation

let consecutiveFailures = 0;
let failureTimestamps: number[] = [];
let isHibernating = false;

function getBackoffDelay(): number {
  const idx = Math.min(consecutiveFailures - 1, BACKOFF_STEPS.length - 1);
  return BACKOFF_STEPS[Math.max(0, idx)];
}

function recordFailure(): void {
  consecutiveFailures++;
  const now = Date.now();
  failureTimestamps.push(now);
  // Prune old timestamps outside the window
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

/**
 * Check if Graphiti is reachable. If not, return a modified MCP config
 * that excludes graphiti-memory.
 */
async function checkGraphitiHealth(): Promise<boolean> {
  try {
    const res = await fetch("http://localhost:8000/", { signal: AbortSignal.timeout(3000) });
    // Any HTTP response means the server is up (404, 307, 200 are all fine)
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
 * Returns true if successfully injected, false if fallback to inbox needed.
 */
async function injectMessage(messages: TelegramMessage[]): Promise<boolean> {
  const q = getActiveQuery();
  if (!q) return false;

  try {
    const formatted = messages
      .map((m) => {
        const source = m.source === "sms" ? "SMS" : "Telegram";
        return `[${source} from ${m.from} at ${m.date.toISOString()}]\n${m.text}`;
      })
      .join("\n\n");

    // streamInput takes an AsyncIterable<SDKUserMessage>
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

/** Wake-up keywords for when Edith is paused */
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
      locationExpiryWarned = false; // Reset so we warn again next time
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

    // Check location expiry on each poll cycle
    await checkLocationExpiry();

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
          // Fallback: write to inbox for current session to read
          writeMessagesToInbox(messages);
          console.log(`   📥 Queued to inbox (injection failed)`);
        }
      } else if (isWakeRunning) {
        // Wake is running but session not yet established
        writeMessagesToInbox(messages);
        console.log(`   ⏳ Edith is starting up — queued to inbox`);
      } else {
        // Edith is idle — write to inbox and trigger immediate wake
        writeMessagesToInbox(messages);
        console.log(`   🔔 Edith is idle — triggering immediate wake`);
        if (interruptSleep) {
          interruptSleep();
        }
      }
    } catch (err) {
      console.error(`❌ Telegram poll error:`, err instanceof Error ? err.message : err);
    }
  }
}

async function watchdogLoop() {
  const schedule = getSchedule();
  const wd = schedule.watchdog;

  console.log(`\n🐕 Edith watchdog starting`);
  console.log(`   Mode: continuous`);
  console.log(`   Idle timeout: ${wd.idleTimeoutSeconds}s`);
  console.log(`   Restart delay: ${wd.restartDelaySeconds}s`);
  console.log(`   Active: ${wd.activeHours.start}–${wd.activeHours.end} ${wd.activeHours.timezone}`);
  console.log(`   Max turns/session: ${schedule.agent?.maxTurns ?? 100}`);
  console.log(`   Memory limit: ${schedule.needs?.memoryCharLimit ?? 8000} chars\n`);

  startCaffeinate();

  // Start Telegram poller in background
  startTelegramPoller();

  let sessionCount = 0;

  while (true) {
    const schedule = getSchedule();

    if (!isWithinActiveHours()) {
      const now = new Date().toLocaleTimeString("en-US", {
        timeZone: schedule.watchdog.activeHours.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      console.log(`😴 ${now} — Outside active hours. Checking in 5m...`);
      await Bun.sleep(300_000);
      continue;
    }

    // Circuit breaker: if hibernating, check less frequently
    if (isHibernating) {
      console.log(`🔌 Circuit breaker: hibernating. Checking in 30m...`);
      await Bun.sleep(HIBERNATION_CHECK_MS);
      // Try one session to see if things are better
      isHibernating = false;
      console.log(`🔌 Circuit breaker: attempting recovery...`);
    }

    sessionCount++;
    const reason = sessionCount === 1 ? "boot" : "watchdog-restart";

    console.log(`${"─".repeat(60)}`);
    console.log(`🔄 Session #${sessionCount} starting — ${new Date().toISOString()}`);

    // Pre-session health checks
    const graphitiUp = await checkGraphitiHealth();
    if (!graphitiUp) {
      console.log(`   ⚠️  Graphiti not reachable — will skip graphiti-memory MCP`);
    }

    isWakeRunning = true;
    let result: WakeResult | null = null;
    let wakeError: Error | null = null;
    try {
      result = await wake(reason, { skipGraphiti: !graphitiUp });
    } catch (err) {
      wakeError = err instanceof Error ? err : new Error(String(err));
      console.error("❌ Wake failed:", wakeError.message);
    }
    isWakeRunning = false;

    // Error recovery logic
    if (wakeError || (result && result.exitCode !== 0 && !result.idleKilled)) {
      recordFailure();
      const errMsg = wakeError?.message ?? `exit code ${result?.exitCode}`;

      if (isRateLimitError(wakeError)) {
        const backoff = getBackoffDelay();
        await alertRandy(`Rate limited. Backing off for ${backoff}s.`);
        await Bun.sleep(backoff * 1000);
        continue;
      }

      if (consecutiveFailures >= CONSECUTIVE_FAILURE_ALERT && consecutiveFailures === CONSECUTIVE_FAILURE_ALERT) {
        await alertRandy(`Edith has failed ${consecutiveFailures} times in a row: ${errMsg}`);
      }

      if (shouldTripCircuitBreaker()) {
        isHibernating = true;
        await alertRandy(`Circuit breaker tripped (${CIRCUIT_BREAKER_THRESHOLD}+ failures in 1 hour). Hibernating — will retry every 30m.`);
        continue;
      }

      const backoff = getBackoffDelay();
      console.log(`⏳ Backoff: ${backoff}s (${consecutiveFailures} consecutive failure${consecutiveFailures > 1 ? "s" : ""})`);
      await Bun.sleep(backoff * 1000);
      continue;
    } else {
      // Successful session — reset failure tracking
      if (consecutiveFailures > 0) {
        console.log(`✅ Recovery: session succeeded after ${consecutiveFailures} failure(s)`);
      }
      resetFailures();
    }

    // Check if Edith wrote a pause signal during this session
    if (checkPauseSignal()) {
      isPaused = true;
      consumePauseSignal();
      console.log(`⏸️  Edith is paused. Waiting for "wake up" message via Telegram...`);
      while (isPaused) {
        await Bun.sleep(5_000);
      }
      console.log(`▶️  Edith resuming from pause`);
    }

    const restartDelay = getRestartDelay(schedule.watchdog.restartDelaySeconds);

    if (result?.idleKilled) {
      console.log(`⏱️  Edith went idle. Restarting in ${restartDelay}s (or sooner on Telegram message)...`);
    } else {
      console.log(`🔁 Session ended naturally. Restarting in ${restartDelay}s (or sooner on Telegram message)...`);
    }

    const sleepResult = await interruptibleSleep(restartDelay * 1000);
    if (sleepResult === "interrupted") {
      console.log(`🔔 Sleep interrupted by Telegram message — waking immediately`);
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
  console.log("\n\n💀 Edith watchdog stopped. Edith is no longer alive.\n");
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopCaffeinate();
  console.log("\n\n💀 Edith watchdog stopped. Edith is no longer alive.\n");
  process.exit(0);
});

watchdogLoop();

