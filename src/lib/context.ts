import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { ROOT, MIND_DIR, JOURNAL_DIR, INDEX_PATH, SKILLS_DIR } from "./paths.ts";
import { getSchedule, getBootDate, getDaysAlive, getTodayWakeCount } from "./schedule.ts";
import { computeState } from "./state.ts";
import { gatherPrewakeContext } from "./prewake.ts";
import { buildSkillIndex, formatSkillsL1 } from "./skill-index.ts";

function readRootFile(name: string): string {
  const path = join(ROOT, name);
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

function readMindFile(name: string): string {
  const path = join(MIND_DIR, name);
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

function getRecentJournal(): string {
  if (!existsSync(JOURNAL_DIR)) return "";

  const datePattern = /^\d{4}-\d{2}-\d{2}\.md$/;
  const files = readdirSync(JOURNAL_DIR)
    .filter((f: string) => datePattern.test(f))
    .sort()
    .reverse()
    .slice(0, 2);

  if (files.length === 0) return "";

  return files
    .map((f) => {
      const content = readFileSync(join(JOURNAL_DIR, f), "utf-8");
      return `## ${f.replace(".md", "")}\n\n${content}`;
    })
    .join("\n\n---\n\n");
}

function getKnowledgeSummaries(): string {
  if (!existsSync(INDEX_PATH)) return "";

  try {
    const entries = JSON.parse(readFileSync(INDEX_PATH, "utf-8")) as Array<{
      id: string;
      l0: string;
      l1: string;
      l2_tokens: number;
    }>;

    if (entries.length === 0) return "";

    return entries
      .map((e) => `### ${e.id} (~${e.l2_tokens} tokens)\n\n${e.l1}`)
      .join("\n\n---\n\n");
  } catch {
    return "";
  }
}

function getSkillsSummary(): string {
  const entries = buildSkillIndex();
  if (entries.length === 0) {
    return "No skills created yet. See `mind/skills/HOW_TO_SKILLS.md` for how to create skills.";
  }
  return formatSkillsL1(entries);
}

export function assembleSystemPrompt(): string {
  const soul = readMindFile("SOUL.md");
  const identity = readMindFile("IDENTITY.md");
  const creator = readMindFile("CREATOR.md");

  const bootDate = getBootDate();
  const daysAlive = getDaysAlive(bootDate);

  const filledIdentity = identity
    .replace("{{FIRST_BOOT_DATE}}", bootDate)
    .replace("{{DAYS_SINCE_BOOT}}", String(daysAlive));

  return [soul, filledIdentity, creator].join("\n\n---\n\n");
}

export function assembleWakeMessage(reason = "heartbeat"): string {
  const schedule = getSchedule();
  const maxTurns = schedule.agent?.maxTurns ?? 100;
  const template = readRootFile("WAKE_PROMPT.md");
  const bootDate = getBootDate();
  const daysAlive = getDaysAlive(bootDate);
  const wakeNumber = getTodayWakeCount() + 1;
  const today = new Date().toISOString().split("T")[0];

  const state = computeState();

  let message = template
    .replace("{{DATE}}", today)
    .replace("{{DAYS_ALIVE}}", String(daysAlive))
    .replace("{{WAKE_NUMBER}}", String(wakeNumber))
    .replace("{{WAKE_REASON}}", reason)
    .replace("{{MAX_TURNS}}", String(maxTurns))
    .replace("{{STATE}}", state);

  const journal = getRecentJournal();
  if (journal) {
    message += `\n\n---\n\n# Recent Journal\n\n${journal}`;
  }

  const memory = readMindFile("MEMORY.md");
  if (memory) {
    message += `\n\n---\n\n# Current Memory\n\n${memory}`;
  }

  const inbox = readMindFile("journal/creator-inbox.md");
  if (inbox.trim()) {
    message += `\n\n---\n\n# Message from Randy\n\nYour creator sent you a message. Read it carefully and consider responding via your outbox (\`journal/creator-outbox.md\`).\n\n${inbox.trim()}`;
  }

  const prewake = gatherPrewakeContext();
  if (prewake) {
    message += `\n\n---\n\n# Today's Context\n\n${prewake}`;
  }

  const knowledge = getKnowledgeSummaries();
  if (knowledge) {
    message += `\n\n---\n\n# Knowledge Base (Summaries)\n\nThese are summaries of your knowledge files. Use \`Read\` to load the full content of any file you need.\n\n${knowledge}`;
  }

  const skills = getSkillsSummary();
  if (skills) {
    message += `\n\n---\n\n# Available Skills\n\nYou have skills in \`mind/skills/\`. Read the full skill file before using it. You can also create new skills — see \`mind/skills/HOW_TO_SKILLS.md\`.\n\n${skills}`;
  }

  return message;
}

