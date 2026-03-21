import { readFileSync, readdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { KNOWLEDGE_DIR, INDEX_PATH } from "./paths.ts";

interface KnowledgeEntry {
  id: string;
  l0: string;
  l1: string;
  l2_tokens: number;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "Untitled";
}

function extractFirstSentence(content: string): string {
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("*") && trimmed.endsWith("*")) continue;
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
  const h2Positions: { heading: string; start: number }[] = [];

  while ((match = h2Regex.exec(content)) !== null) {
    h2Positions.push({ heading: match[1].trim(), start: match.index });
  }

  for (let i = 0; i < h2Positions.length; i++) {
    const { heading, start } = h2Positions[i];
    const end = i + 1 < h2Positions.length ? h2Positions[i + 1].start : content.length;
    const sectionBody = content.slice(start, end);

    const bodyLines = sectionBody.split("\n").slice(1);
    let paragraph = "";
    let inParagraph = false;
    for (const line of bodyLines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (inParagraph) break;
        continue;
      }
      if (trimmed.startsWith("#")) break;
      if (trimmed.startsWith("*") && trimmed.endsWith("*") && !inParagraph) continue;
      inParagraph = true;
      paragraph += (paragraph ? " " : "") + trimmed;
    }

    const words = paragraph.split(/\s+/);
    const truncated = words.length > 80 ? words.slice(0, 80).join(" ") + "..." : paragraph;

    sections.push(`- **${heading}**: ${truncated}`);
  }

  return `# ${title}\n${sections.join("\n")}`;
}

export function buildIndex(): void {
  if (!existsSync(KNOWLEDGE_DIR)) {
    console.log("No knowledge directory found.");
    return;
  }

  const files = readdirSync(KNOWLEDGE_DIR)
    .filter((f: string) => f.endsWith(".md") && !f.startsWith(".") && f !== "README.md")
    .sort();

  const entries: KnowledgeEntry[] = files.map((f: string) => {
    const content = readFileSync(join(KNOWLEDGE_DIR, f), "utf-8");
    const title = extractTitle(content);
    const firstSentence = extractFirstSentence(content);

    return {
      id: f,
      l0: `${title} — ${firstSentence}`,
      l1: extractL1(content),
      l2_tokens: estimateTokens(content),
    };
  });

  writeFileSync(INDEX_PATH, JSON.stringify(entries, null, 2), "utf-8");
  console.log(`Index built: ${entries.length} entries → ${INDEX_PATH}`);
  for (const e of entries) {
    console.log(`  ${e.id}: L0=${estimateTokens(e.l0)}t, L1=${estimateTokens(e.l1)}t, L2=${e.l2_tokens}t`);
  }
}

