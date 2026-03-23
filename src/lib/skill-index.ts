/**
 * Skill indexer — builds L0/L1 summaries of skills for context injection.
 * Runs pre-session in the daemon. Hash-based change detection.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { SKILLS_DIR, SKILL_INDEX_PATH } from "./paths.ts";

export interface SkillEntry {
  id: string;
  name: string;
  description: string;
  trigger: string;
  requires?: string;
  output?: string;
  hash: string;
}

interface SkillIndex {
  entries: SkillEntry[];
  builtAt: string;
}

function parseYamlFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};

  const fields: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (kv) {
      fields[kv[1]] = kv[2].trim();
    }
  }
  return fields;
}

function hashContent(content: string): string {
  return createHash("md5").update(content).digest("hex").slice(0, 12);
}

export function buildSkillIndex(): SkillEntry[] {
  if (!existsSync(SKILLS_DIR)) return [];

  const files = readdirSync(SKILLS_DIR)
    .filter((f: string) => f.endsWith(".md") && !f.startsWith(".") && f !== "HOW_TO_SKILLS.md")
    .sort();

  if (files.length === 0) return [];

  // Check if rebuild needed via hash comparison
  let existingIndex: SkillIndex | null = null;
  if (existsSync(SKILL_INDEX_PATH)) {
    try {
      existingIndex = JSON.parse(readFileSync(SKILL_INDEX_PATH, "utf-8"));
    } catch {}
  }

  const entries: SkillEntry[] = [];
  let changed = false;

  for (const f of files) {
    const content = readFileSync(join(SKILLS_DIR, f), "utf-8");
    const hash = hashContent(content);
    const fm = parseYamlFrontmatter(content);

    const entry: SkillEntry = {
      id: f.replace(".md", ""),
      name: fm.name ?? f.replace(".md", ""),
      description: fm.description ?? "",
      trigger: fm.trigger ?? "",
      requires: fm.requires,
      output: fm.output,
      hash,
    };

    // Check if this entry changed
    const existing = existingIndex?.entries.find(e => e.id === entry.id);
    if (!existing || existing.hash !== hash) {
      changed = true;
    }

    entries.push(entry);
  }

  // Check for removed skills
  if (existingIndex && existingIndex.entries.length !== entries.length) {
    changed = true;
  }

  if (changed || !existingIndex) {
    const index: SkillIndex = { entries, builtAt: new Date().toISOString() };
    writeFileSync(SKILL_INDEX_PATH, JSON.stringify(index, null, 2), "utf-8");
    console.log(`🎯 Skill index rebuilt: ${entries.length} skill(s)`);
  }

  return entries;
}

/**
 * Format L0 summary: just name + trigger (~5 tokens/skill)
 */
export function formatSkillsL0(entries: SkillEntry[]): string {
  if (entries.length === 0) return "";
  return entries.map(e => `- **${e.name}**: ${e.trigger}`).join("\n");
}

/**
 * Format L1 summary: name + description + trigger + requires/output (~30 tokens/skill)
 */
export function formatSkillsL1(entries: SkillEntry[]): string {
  if (entries.length === 0) return "";
  return entries.map(e => {
    const parts = [`### ${e.name}`, e.description];
    if (e.trigger) parts.push(`**When:** ${e.trigger}`);
    if (e.requires) parts.push(`**Requires:** ${e.requires}`);
    if (e.output) parts.push(`**Output:** ${e.output}`);
    parts.push(`**File:** \`mind/skills/${e.id}.md\``);
    return parts.join("\n");
  }).join("\n\n");
}
