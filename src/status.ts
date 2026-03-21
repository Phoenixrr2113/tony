import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { ROOT, MIND_DIR, LOGS_DIR, ARCHIVE_PATH } from "./lib/paths.ts";
import { getSchedule } from "./lib/schedule.ts";

function main() {
  const schedule = getSchedule();
  const bootDate = schedule.creature?.bootDate;

  console.log("\n🔍 Edith Status");
  console.log("─".repeat(40));

  if (bootDate) {
    const days = Math.floor(
      (Date.now() - new Date(bootDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    console.log(`Born:     ${bootDate}`);
    console.log(`Age:      ${days} days`);
  } else {
    console.log("Born:     Not yet (never booted)");
  }

  console.log(`Interval: ${schedule.heartbeat.interval}`);
  console.log(`Active:   ${schedule.heartbeat.activeHours.start}–${schedule.heartbeat.activeHours.end} ${schedule.heartbeat.activeHours.timezone}`);

  const today = new Date().toISOString().split("T")[0];
  const logPath = join(LOGS_DIR, `${today}.jsonl`);
  if (existsSync(logPath)) {
    const lines = readFileSync(logPath, "utf-8").trim().split("\n").filter(Boolean);
    console.log(`\nToday:    ${lines.length} wakes`);
  } else {
    console.log("\nToday:    No wakes yet");
  }

  const journalDir = join(MIND_DIR, "journal");
  if (existsSync(journalDir)) {
    const datePattern = /^\d{4}-\d{2}-\d{2}\.md$/;
    const entries = readdirSync(journalDir).filter(
      (f) => datePattern.test(f)
    );
    console.log(`Journal:  ${entries.length} days recorded`);
    if (entries.length > 0) {
      const latest = entries.sort().reverse()[0];
      console.log(`Latest:   ${latest}`);
    }
  }

  const memoryPath = join(MIND_DIR, "MEMORY.md");
  if (existsSync(memoryPath)) {
    const memory = readFileSync(memoryPath, "utf-8");
    const hasContent = memory.includes("*(Empty") ? "Empty (hasn't lived yet)" : "Has content";
    console.log(`Memory:   ${hasContent}`);
  }

  if (existsSync(ARCHIVE_PATH)) {
    const content = readFileSync(ARCHIVE_PATH, "utf-8");
    const count = (content.match(/^---/gm) || []).length;
    console.log(`Messages: ${count} sent to creator`);
  }

  try {
    const proc = Bun.spawnSync(["claude", "--version"], { stdout: "pipe" });
    const version = new TextDecoder().decode(proc.stdout).trim();
    console.log(`\nClaude:   ${version}`);
  } catch {
    console.log("\nClaude:   ⚠️  CLI not found");
  }

  console.log("─".repeat(40) + "\n");
}

main();

