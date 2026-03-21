import { appendFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { LOGS_DIR, TRANSCRIPTS_DIR, JOURNAL_DIR, JOURNAL_ARCHIVE_DIR } from "./paths.ts";

export function ensureDirs() {
  for (const dir of [LOGS_DIR, TRANSCRIPTS_DIR, JOURNAL_DIR, JOURNAL_ARCHIVE_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

export function logWake(entry: Record<string, unknown>) {
  const today = new Date().toISOString().split("T")[0];
  const logPath = join(LOGS_DIR, `${today}.jsonl`);
  appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf-8");
}

