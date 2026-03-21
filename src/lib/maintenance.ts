import { existsSync, mkdirSync, readdirSync, renameSync } from "fs";
import { join } from "path";
import { JOURNAL_DIR, JOURNAL_ARCHIVE_DIR } from "./paths.ts";
import { getSchedule } from "./schedule.ts";

export function runMaintenance(): string[] {
  const report: string[] = [];

  const archived = archiveOldJournals();
  if (archived > 0) {
    report.push(`📦 Archived ${archived} old journal ${archived === 1 ? "entry" : "entries"}`);
  }

  return report;
}

function archiveOldJournals(): number {
  const schedule = getSchedule();
  const archiveDays = schedule.needs?.journalArchiveAfterDays ?? 7;

  if (!existsSync(JOURNAL_DIR)) return 0;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - archiveDays);
  const cutoff = cutoffDate.toISOString().split("T")[0];

  const entries = readdirSync(JOURNAL_DIR)
    .filter((f: string) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));

  let archived = 0;

  for (const entry of entries) {
    const date = entry.replace(".md", "");
    if (date < cutoff) {
      if (!existsSync(JOURNAL_ARCHIVE_DIR)) {
        mkdirSync(JOURNAL_ARCHIVE_DIR, { recursive: true });
      }
      renameSync(join(JOURNAL_DIR, entry), join(JOURNAL_ARCHIVE_DIR, entry));
      console.log(`  📦 Archived journal/${entry}`);
      archived++;
    }
  }

  return archived;
}

