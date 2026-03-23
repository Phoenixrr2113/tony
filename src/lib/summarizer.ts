/**
 * Daemon-side summarizer — watches configurable directories and builds
 * compact L0/L1 summaries for the context window.
 *
 * Replaces the old indexer with support for multiple watch directories
 * (e.g., mind/knowledge + Obsidian vault).
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "fs";
import { join, basename } from "path";
import { createHash } from "crypto";
import { ROOT } from "./paths.ts";
import { getSchedule } from "./schedule.ts";

export interface SummaryEntry {
  id: string;
  label: string;
  l0: string;         // filename + title (~5 tokens)
  l1: string;         // section headings + first sentence (~50 tokens)
  l2_tokens: number;  // how big the full file is
  hash: string;
}

interface SummarizerConfig {
  watchDirs: Array<{ path: string; label: string }>;
  outputPath: string;
  maxTotalTokens: number;
}

function getConfig(): SummarizerConfig {
  const schedule = getSchedule();
  if (schedule.summarizer) return schedule.summarizer as SummarizerConfig;

  // Default: just watch mind/knowledge
  return {
    watchDirs: [
      { path: "./mind/knowledge", label: "Knowledge" },
    ],
    outputPath: "./mind/.summaries.json",
    maxTotalTokens: 2000,
  };
}

function resolvePath(p: string): string {
  if (p.startsWith("/")) return p;
  return join(ROOT, p);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function hashContent(content: string): string {
  return createHash("md5").update(content).digest("hex").slice(0, 12);
}

function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "Untitled";
}

function extractFirstSentence(content: string): string {
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || (trimmed.startsWith("*") && trimmed.endsWith("*"))) continue;
    // Skip YAML frontmatter
    if (trimmed === "---") continue;
    const sentenceMatch = trimmed.match(/^(.+?[.!?])\s/);
    return sentenceMatch ? sentenceMatch[1] : trimmed.slice(0, 120);
  }
  return "";
}

function extractL1(content: string): string {
  const title = extractTitle(content);
  const sections: string[] = [];

  const h2Regex = /^##\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = h2Regex.exec(content)) !== null) {
    sections.push(match[1].trim());
  }

  if (sections.length === 0) {
    const firstSentence = extractFirstSentence(content);
    return firstSentence ? `${title}: ${firstSentence}` : title;
  }

  return `${title} — Sections: ${sections.join(", ")}`;
}

function scanDirectory(dirPath: string, label: string): SummaryEntry[] {
  const resolved = resolvePath(dirPath);
  if (!existsSync(resolved)) return [];

  const files = readdirSync(resolved)
    .filter((f: string) => f.endsWith(".md") && !f.startsWith(".") && f !== "README.md")
    .sort();

  return files.map((f: string) => {
    const content = readFileSync(join(resolved, f), "utf-8");
    const title = extractTitle(content);
    const firstSentence = extractFirstSentence(content);

    return {
      id: f,
      label,
      l0: `${title} — ${firstSentence}`.slice(0, 80),
      l1: extractL1(content),
      l2_tokens: estimateTokens(content),
      hash: hashContent(content),
    };
  });
}

export function buildSummaries(): SummaryEntry[] {
  const config = getConfig();
  const allEntries: SummaryEntry[] = [];

  for (const dir of config.watchDirs) {
    const entries = scanDirectory(dir.path, dir.label);
    allEntries.push(...entries);
  }

  // Check if rebuild needed
  const outputPath = resolvePath(config.outputPath);
  let needsWrite = true;
  if (existsSync(outputPath)) {
    try {
      const existing: SummaryEntry[] = JSON.parse(readFileSync(outputPath, "utf-8"));
      if (existing.length === allEntries.length &&
          existing.every((e, i) => e.hash === allEntries[i]?.hash && e.id === allEntries[i]?.id)) {
        needsWrite = false;
      }
    } catch {}
  }

  if (needsWrite) {
    writeFileSync(outputPath, JSON.stringify(allEntries, null, 2), "utf-8");
    if (allEntries.length > 0) {
      console.log(`📚 Summaries rebuilt: ${allEntries.length} file(s) from ${config.watchDirs.map(d => d.label).join(", ")}`);
    }
  }

  return allEntries;
}

/**
 * Format summaries for context injection.
 * Respects token budget — drops older files to L0 if over budget.
 */
export function formatSummariesForContext(entries: SummaryEntry[]): string {
  if (entries.length === 0) return "";

  const config = getConfig();
  const budget = config.maxTotalTokens;

  // Group by label
  const byLabel = new Map<string, SummaryEntry[]>();
  for (const e of entries) {
    const group = byLabel.get(e.label) ?? [];
    group.push(e);
    byLabel.set(e.label, group);
  }

  const sections: string[] = [];
  let totalTokens = 0;

  for (const [label, group] of byLabel) {
    const lines: string[] = [`### ${label}`];
    for (const e of group) {
      const l1Line = `- **${e.id}** (~${e.l2_tokens}t): ${e.l1}`;
      const l0Line = `- **${e.id}**: ${e.l0}`;
      const l1Tokens = estimateTokens(l1Line);

      if (totalTokens + l1Tokens <= budget) {
        lines.push(l1Line);
        totalTokens += l1Tokens;
      } else {
        // Over budget — use L0 (shorter)
        lines.push(l0Line);
        totalTokens += estimateTokens(l0Line);
      }
    }
    sections.push(lines.join("\n"));
  }

  return sections.join("\n\n");
}
