import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { ROOT, LOGS_DIR } from "./paths.ts";

export function getSchedule() {
  return JSON.parse(readFileSync(join(ROOT, "schedule.json"), "utf-8"));
}

export function getBootDate(): string {
  const schedule = getSchedule();
  if (!schedule.agent.bootDate) {
    schedule.agent.bootDate = new Date().toISOString().split("T")[0];
    writeFileSync(join(ROOT, "schedule.json"), JSON.stringify(schedule, null, 2), "utf-8");
  }
  return schedule.agent.bootDate;
}

export function getDaysAlive(bootDate: string): number {
  const boot = new Date(bootDate);
  const now = new Date();
  return Math.floor((now.getTime() - boot.getTime()) / (1000 * 60 * 60 * 24));
}

export function parseInterval(interval: string): number {
  const match = interval.match(/^(\d+)(s|m|h)$/);
  if (!match) throw new Error(`Invalid interval: ${interval}`);

  const [, value, unit] = match;
  const num = parseInt(value, 10);

  switch (unit) {
    case "s": return num * 1000;
    case "m": return num * 60 * 1000;
    case "h": return num * 60 * 60 * 1000;
    default: throw new Error(`Unknown unit: ${unit}`);
  }
}

export function isWithinActiveHours(): boolean {
  const schedule = getSchedule();
  const activeHours = schedule.watchdog?.activeHours ?? schedule.heartbeat?.activeHours;
  if (!activeHours) return true;
  const { start, end, timezone } = activeHours;

  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone ?? "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const currentTime = formatter.format(now);
  return currentTime >= start && currentTime < end;
}

export function getTodayWakeCount(): number {
  const today = new Date().toISOString().split("T")[0];
  const logPath = join(LOGS_DIR, `${today}.jsonl`);
  if (!existsSync(logPath)) return 0;
  return readFileSync(logPath, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .filter((line: string) => {
      try { return JSON.parse(line).exitCode === 0; } catch { return false; }
    }).length;
}

export function getDailySpend(): number {
  const today = new Date().toISOString().split("T")[0];
  const logPath = join(LOGS_DIR, `${today}.jsonl`);
  if (!existsSync(logPath)) return 0;
  const lines = readFileSync(logPath, "utf-8").trim().split("\n").filter(Boolean);
  return lines.length;
}

