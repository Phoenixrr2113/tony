import { existsSync, readFileSync, unlinkSync } from "fs";
import { getSchedule, isWithinActiveHours } from "./lib/schedule.ts";
import { wake } from "./wake.ts";
import type { WakeResult } from "./wake.ts";
import { join } from "path";
import { ROOT } from "./lib/paths.ts";
import { pollTelegramMessages } from "./lib/telegram.ts";
import { writeMessagesToInbox } from "./lib/messaging.ts";

const SCHEDULE_REQUEST_PATH = join(ROOT, "mind", "schedule-request.json");
const TELEGRAM_POLL_INTERVAL_MS = 5_000;

let caffeinateProc: ReturnType<typeof Bun.spawn> | null = null;
let isWakeRunning = false;
let interruptSleep: (() => void) | null = null;

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

    try {
      const messages = await pollTelegramMessages();
      if (messages.length === 0) continue;

      console.log(`📬 ${messages.length} Telegram message(s) from Randy`);

      writeMessagesToInbox(messages);

      if (isWakeRunning) {
        console.log(`   ⏳ Edith is busy — queued to inbox for next session`);
      } else {
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
  console.log(`   Max turns/session: ${schedule.creature?.maxTurns ?? 100}`);
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

    sessionCount++;
    const reason = sessionCount === 1 ? "boot" : "watchdog-restart";

    console.log(`${"─".repeat(60)}`);
    console.log(`🔄 Session #${sessionCount} starting — ${new Date().toISOString()}`);

    isWakeRunning = true;
    let result: WakeResult | null = null;
    try {
      result = await wake(reason);
    } catch (err) {
      console.error("❌ Wake failed:", err instanceof Error ? err.message : err);
    }
    isWakeRunning = false;

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

