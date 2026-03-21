import { getSchedule, isWithinActiveHours, parseInterval } from "./lib/schedule.ts";
import { wake } from "./wake.ts";
import { isWakeLocked } from "./lib/wakelock.ts";

async function heartbeatLoop() {
  const schedule = getSchedule();
  console.log(`\n🫀 Edith daemon starting`);
  console.log(`   Interval: ${schedule.heartbeat.interval}`);
  console.log(`   Active: ${schedule.heartbeat.activeHours.start}–${schedule.heartbeat.activeHours.end} ${schedule.heartbeat.activeHours.timezone}`);
  console.log(`   Max turns/wake: ${schedule.creature?.maxTurns ?? 25}`);
  console.log(`   Journal archive: ${schedule.needs?.journalArchiveAfterDays ?? 7} days`);
  console.log(`   Memory limit: ${schedule.needs?.memoryCharLimit ?? 8000} chars\n`);

  while (true) {
    const schedule = getSchedule();
    const intervalMs = parseInterval(schedule.heartbeat.interval);

    if (!isWithinActiveHours()) {
      const now = new Date().toLocaleTimeString("en-US", {
        timeZone: schedule.heartbeat.activeHours.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      console.log(`😴 ${now} — Outside active hours. Sleeping...`);
      await Bun.sleep(intervalMs);
      continue;
    }

    if (isWakeLocked()) {
      console.log(`🔒 Previous wake still running. Waiting...`);
      await Bun.sleep(intervalMs);
      continue;
    }

    try {
      await wake("heartbeat");
    } catch (err) {
      console.error("❌ Wake failed:", err instanceof Error ? err.message : err);
    }

    console.log(`⏰ Next wake in ${schedule.heartbeat.interval}\n${"─".repeat(60)}`);
    await Bun.sleep(intervalMs);
  }
}

process.on("SIGINT", () => {
  console.log("\n\n💀 Edith daemon stopped. Edith is no longer alive.\n");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n\n💀 Edith daemon stopped. Edith is no longer alive.\n");
  process.exit(0);
});

heartbeatLoop();

