import { existsSync, mkdirSync, readdirSync, renameSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { JOURNAL_DIR, JOURNAL_ARCHIVE_DIR, MEMORY_PATH, MIND_DIR } from "./paths.ts";
import { getSchedule } from "./schedule.ts";

const CONSOLIDATION_PATH = join(MIND_DIR, ".consolidation-needed.json");
const MEMORY_STALENESS_DAYS = 14;

export function runMaintenance(): string[] {
  const report: string[] = [];

  // Flag journals that need consolidation before archiving
  const toConsolidate = flagJournalsForConsolidation();
  if (toConsolidate > 0) {
    report.push(`📋 ${toConsolidate} journal(s) need consolidation before archiving — see mind/.consolidation-needed.json`);
  }

  const archived = archiveOldJournals();
  if (archived > 0) {
    report.push(`📦 Archived ${archived} old journal ${archived === 1 ? "entry" : "entries"}`);
  }

  const stale = checkMemoryStaleness();
  if (stale.length > 0) {
    report.push(`⏰ Stale MEMORY.md sections (14+ days): ${stale.join(", ")}`);
  }

  return report;
}

/**
 * Flag journals that are about to be archived so Edith can extract
 * key facts into Graphiti before they disappear from her context.
 */
function flagJournalsForConsolidation(): number {
  const schedule = getSchedule();
  const archiveDays = schedule.needs?.journalArchiveAfterDays ?? 7;
  if (!existsSync(JOURNAL_DIR)) return 0;

  // Flag journals that will be archived in the next session (1 day buffer)
  const warningDate = new Date();
  warningDate.setDate(warningDate.getDate() - archiveDays + 1);
  const warningCutoff = warningDate.toISOString().split("T")[0];

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - archiveDays);
  const archiveCutoff = cutoffDate.toISOString().split("T")[0];

  const entries = readdirSync(JOURNAL_DIR)
    .filter((f: string) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));

  const needsConsolidation: string[] = [];
  for (const entry of entries) {
    const date = entry.replace(".md", "");
    if (date <= warningCutoff && date >= archiveCutoff) {
      needsConsolidation.push(entry);
    }
  }

  if (needsConsolidation.length > 0) {
    writeFileSync(CONSOLIDATION_PATH, JSON.stringify({
      files: needsConsolidation,
      reason: "These journals will be archived soon. Extract key facts into Graphiti before they leave your context.",
      flaggedAt: new Date().toISOString(),
    }, null, 2), "utf-8");
  } else if (existsSync(CONSOLIDATION_PATH)) {
    try { writeFileSync(CONSOLIDATION_PATH, "[]", "utf-8"); } catch {}
  }

  return needsConsolidation.length;
}

/**
 * Check MEMORY.md for sections that haven't been updated recently.
 * Looks for ## headings and checks for "Last updated: YYYY-MM-DD" lines.
 */
function checkMemoryStaleness(): string[] {
  if (!existsSync(MEMORY_PATH)) return [];

  const content = readFileSync(MEMORY_PATH, "utf-8");
  const sections = content.split(/^## /m).slice(1); // skip content before first ##
  const stale: string[] = [];
  const now = Date.now();

  for (const section of sections) {
    const titleMatch = section.match(/^(.+)/);
    if (!titleMatch) continue;
    const title = titleMatch[1].trim();

    const dateMatch = section.match(/Last updated:\s*(\d{4}-\d{2}-\d{2})/i);
    if (dateMatch) {
      const updated = new Date(dateMatch[1]).getTime();
      const daysSince = (now - updated) / (1000 * 60 * 60 * 24);
      if (daysSince >= MEMORY_STALENESS_DAYS) {
        stale.push(title);
      }
    }
    // If no "Last updated" marker, we can't check staleness — skip
  }

  return stale;
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

