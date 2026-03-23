import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { ROOT, MIND_DIR, JOURNAL_DIR, INDEX_PATH, SKILLS_DIR, TASKS_PATH } from "./paths.ts";

const CONSOLIDATION_PATH = join(MIND_DIR, ".consolidation-needed.json");
import { getSchedule, getBootDate, getDaysAlive, getTodayWakeCount } from "./schedule.ts";
import { computeState } from "./state.ts";
import { gatherPrewakeContext } from "./prewake.ts";
import { buildSkillIndex, formatSkillsL1 } from "./skill-index.ts";
import { buildSummaries, formatSummariesForContext } from "./summarizer.ts";

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
  const entries = buildSummaries();
  if (entries.length === 0) return "";
  return formatSummariesForContext(entries);
}

interface Task {
  id: string;
  title: string;
  priority: "high" | "medium" | "low";
  status: "pending" | "in-progress" | "done";
  created: string;
  due?: string;
  source?: string;
  notes?: string;
}

function getPendingTasks(): string {
  if (!existsSync(TASKS_PATH)) return "";
  try {
    const tasks: Task[] = JSON.parse(readFileSync(TASKS_PATH, "utf-8"));
    const pending = tasks.filter(t => t.status !== "done");
    if (pending.length === 0) return "";

    // Sort: high priority first, then by due date
    pending.sort((a, b) => {
      const prio = { high: 0, medium: 1, low: 2 };
      const prioDiff = prio[a.priority] - prio[b.priority];
      if (prioDiff !== 0) return prioDiff;
      if (a.due && b.due) return a.due.localeCompare(b.due);
      if (a.due) return -1;
      if (b.due) return 1;
      return 0;
    });

    return pending.map(t => {
      const parts = [`- **[${t.priority.toUpperCase()}]** ${t.title}`];
      if (t.due) parts.push(`  Due: ${t.due}`);
      if (t.status === "in-progress") parts.push(`  Status: in progress`);
      if (t.notes) parts.push(`  Notes: ${t.notes}`);
      if (t.source) parts.push(`  Source: ${t.source}`);
      return parts.join("\n");
    }).join("\n");
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

  // Consolidation warnings
  if (existsSync(CONSOLIDATION_PATH)) {
    try {
      const consolidation = JSON.parse(readFileSync(CONSOLIDATION_PATH, "utf-8"));
      if (consolidation.files && consolidation.files.length > 0) {
        message += `\n\n---\n\n# ⚠️ Journal Consolidation Needed\n\nThese journals will be archived soon. Read them and extract any important facts into Graphiti (via \`add_episode\`) before they leave your context:\n\n${consolidation.files.map((f: string) => `- \`journal/${f}\``).join("\n")}\n\n${consolidation.reason}`;
      }
    } catch {}
  }

  const tasks = getPendingTasks();
  if (tasks) {
    message += `\n\n---\n\n# Pending Tasks\n\nThese are your tracked tasks from \`mind/tasks.json\`. Update status as you work on them. Mark done with \`status: "done"\`. Create new tasks when you notice something actionable.\n\n${tasks}`;
  }

  const skills = getSkillsSummary();
  if (skills) {
    message += `\n\n---\n\n# Available Skills\n\nYou have skills in \`mind/skills/\`. Read the full skill file before using it. You can also create new skills — see \`mind/skills/HOW_TO_SKILLS.md\`.\n\n${skills}`;
  }

  return message;
}

