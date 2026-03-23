import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { MEMORY_PATH, LOGS_DIR, JOURNAL_DIR, JOURNAL_ARCHIVE_DIR, KNOWLEDGE_DIR, INBOX_PATH, OUTBOX_PATH, LOCATION_PATH } from "./paths.ts";
import { getSchedule, getBootDate, getDaysAlive, getTodayWakeCount } from "./schedule.ts";

export function computeState(): string {
  const schedule = getSchedule();
  const lines: string[] = [];

  const tz = schedule.watchdog?.activeHours?.timezone ?? schedule.heartbeat?.activeHours?.timezone ?? "America/New_York";
  const localTime = new Date().toLocaleString("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    weekday: "long",
  });
  lines.push(`Local time: ${localTime} (${tz})`);

  const bootDate = getBootDate();
  const daysAlive = getDaysAlive(bootDate);
  lines.push(`Age: ${daysAlive} days (born ${bootDate})`);

  const memorySize = existsSync(MEMORY_PATH) ? readFileSync(MEMORY_PATH, "utf-8").length : 0;
  const memoryLimit = schedule.needs?.memoryCharLimit ?? 8000;
  const memoryPercent = Math.round((memorySize / memoryLimit) * 100);
  lines.push(`Memory: ${memorySize.toLocaleString()} / ${memoryLimit.toLocaleString()} chars (${memoryPercent}%)`);

  const activeJournals = countFiles(JOURNAL_DIR, /^\d{4}-\d{2}-\d{2}\.md$/);
  const archivedJournals = countFiles(JOURNAL_ARCHIVE_DIR, /^\d{4}-\d{2}-\d{2}\.md$/);
  lines.push(`Journal: ${activeJournals} active, ${archivedJournals} archived`);

  const knowledgeFiles = countFiles(KNOWLEDGE_DIR, /\.md$/);
  lines.push(`Knowledge files: ${knowledgeFiles}`);

  const totalWakes = getTotalLifetimeWakes();
  const todayWakes = getTodayWakeCount();
  lines.push(`Wakes: ${todayWakes} today, ${totalWakes} lifetime`);

  lines.push(`Mode: continuous (watchdog)`);
  lines.push(`Idle timeout: ${schedule.watchdog?.idleTimeoutSeconds ?? 300}s`);

  const hasInbox = existsSync(INBOX_PATH) && readFileSync(INBOX_PATH, "utf-8").trim().length > 0;
  const hasOutbox = existsSync(OUTBOX_PATH) && readFileSync(OUTBOX_PATH, "utf-8").trim().length > 0;
  if (hasInbox) lines.push(`Inbox: message from Randy waiting`);
  if (hasOutbox) lines.push(`Outbox: unsent message to Randy`);

  const battery = getBatteryStatus();
  if (battery) lines.push(`Battery: ${battery}`);

  const location = getLocationStatus();
  if (location) lines.push(`Randy's location: ${location}`);

  const lastLog = getLastWakeLog();
  if (lastLog) {
    const maxTurns = schedule.agent?.maxTurns ?? 100;
    const parts: string[] = [];
    if (lastLog.durationSeconds !== undefined) parts.push(`${lastLog.durationSeconds}s`);
    if (lastLog.turns !== undefined) parts.push(`${lastLog.turns}/${maxTurns} turns`);
    if (lastLog.exitCode !== undefined) parts.push(`exit ${lastLog.exitCode}`);
    if (parts.length > 0) lines.push(`Last wake: ${parts.join(", ")}`);

    if (lastLog.timestamp) {
      const elapsed = Math.round((Date.now() - new Date(lastLog.timestamp).getTime()) / 1000);
      lines.push(`Time since last wake: ${formatDuration(elapsed)}`);
    }
  }

  return lines.join("\n");
}

function countFiles(dir: string, pattern: RegExp): number {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((f: string) => pattern.test(f)).length;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getTotalLifetimeWakes(): number {
  if (!existsSync(LOGS_DIR)) return 0;
  const logFiles = readdirSync(LOGS_DIR).filter((f: string) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f));
  let total = 0;
  for (const file of logFiles) {
    const content = readFileSync(join(LOGS_DIR, file), "utf-8").trim();
    if (content) total += content.split("\n").filter(Boolean).length;
  }
  return total;
}

function getBatteryStatus(): string | null {
  try {
    const result = Bun.spawnSync(["pmset", "-g", "batt"]);
    const output = result.stdout.toString().trim();
    const match = output.match(/(\d+)%;\s*(charging|discharging|charged|finishing charge|AC attached)/i);
    if (match) {
      const percent = parseInt(match[1], 10);
      const status = match[2].toLowerCase();
      return `${percent}%, ${status}`;
    }
    if (output.includes("No battery")) return "No battery (desktop)";
    return null;
  } catch {
    return null;
  }
}

function getLocationStatus(): string | null {
  if (!existsSync(LOCATION_PATH)) return null;
  try {
    const loc = JSON.parse(readFileSync(LOCATION_PATH, "utf-8"));
    const age = Math.round((Date.now() - new Date(loc.timestamp).getTime()) / 1000);
    const ageStr = formatDuration(age);

    // Check if live location has expired
    if (loc.expiresAt && new Date(loc.expiresAt).getTime() < Date.now()) {
      return `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)} (expired ${ageStr} ago)`;
    }

    return `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)} (${ageStr} ago)`;
  } catch {
    return null;
  }
}

function getLastWakeLog(): any | null {
  if (!existsSync(LOGS_DIR)) return null;
  const logFiles = readdirSync(LOGS_DIR)
    .filter((f: string) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
    .sort()
    .reverse();

  for (const file of logFiles) {
    const logLines = readFileSync(join(LOGS_DIR, file), "utf-8").trim().split("\n").filter(Boolean);
    if (logLines.length === 0) continue;

    try {
      return JSON.parse(logLines[logLines.length - 1]);
    } catch {
      continue;
    }
  }

  return null;
}

