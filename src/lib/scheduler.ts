/**
 * Cron-like scheduler for Edith's briefs.
 * Evaluates brief schedules and determines what should fire next.
 */
import { getSchedule } from "./schedule.ts";

export interface BriefSchedule {
  name: string;
  /** Cron-like time: "HH:MM" in local timezone */
  time: string;
  type: "morning" | "midday" | "evening";
  enabled: boolean;
}

/**
 * Get configured briefs from schedule.json.
 * Falls back to sensible defaults if not configured.
 */
export function getBriefSchedules(): BriefSchedule[] {
  const schedule = getSchedule();
  if (schedule.briefs && Array.isArray(schedule.briefs)) {
    return schedule.briefs;
  }
  // Defaults
  return [
    { name: "morning", time: "08:00", type: "morning", enabled: true },
    { name: "midday", time: "12:00", type: "midday", enabled: true },
    { name: "evening", time: "17:00", type: "evening", enabled: true },
  ];
}

/**
 * Get the timezone from schedule config.
 */
export function getTimezone(): string {
  const schedule = getSchedule();
  return schedule.watchdog?.activeHours?.timezone ?? "America/New_York";
}

/**
 * Get current local time as "HH:MM" string.
 */
export function getLocalTime(tz: string): string {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Parse "HH:MM" to minutes since midnight.
 */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Find the next brief that should fire.
 * Returns null if no brief is due.
 * A brief is "due" if the current time is within a 5-minute window after its scheduled time
 * and it hasn't already been fired (tracked by the caller via firedSet).
 */
export function getNextDueBrief(firedToday: Set<string>): BriefSchedule | null {
  const tz = getTimezone();
  const now = getLocalTime(tz);
  const nowMinutes = timeToMinutes(now);
  const briefs = getBriefSchedules();

  for (const brief of briefs) {
    if (!brief.enabled) continue;
    if (firedToday.has(brief.name)) continue;

    const briefMinutes = timeToMinutes(brief.time);
    // Fire if we're within a 10-minute window after scheduled time
    if (nowMinutes >= briefMinutes && nowMinutes < briefMinutes + 10) {
      return brief;
    }
  }

  return null;
}

/**
 * Calculate milliseconds until the next brief fires.
 * Used to set the sleep timer between checks.
 */
export function msUntilNextBrief(firedToday: Set<string>): number {
  const tz = getTimezone();
  const now = getLocalTime(tz);
  const nowMinutes = timeToMinutes(now);
  const briefs = getBriefSchedules();

  let minWait = 60 * 60 * 1000; // Default: check every hour

  for (const brief of briefs) {
    if (!brief.enabled) continue;
    if (firedToday.has(brief.name)) continue;

    const briefMinutes = timeToMinutes(brief.time);
    let diffMinutes = briefMinutes - nowMinutes;
    if (diffMinutes < 0) continue; // Already past

    const diffMs = diffMinutes * 60 * 1000;
    if (diffMs < minWait) {
      minWait = diffMs;
    }
  }

  // Don't sleep less than 30s (to avoid tight loops)
  return Math.max(30_000, minWait);
}

/**
 * Get the current date string for tracking "today's" fired briefs.
 */
export function getTodayKey(tz: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
}
