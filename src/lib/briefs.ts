/**
 * Brief assembly — builds the right prompt for each event type.
 * Replaces the monolithic WAKE_PROMPT.md with targeted brief templates.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { MIND_DIR, JOURNAL_DIR, TASKS_PATH } from "./paths.ts";
import { getSchedule, getBootDate, getDaysAlive, getTodayWakeCount } from "./schedule.ts";
import { computeState } from "./state.ts";
import { gatherPrewakeContext } from "./prewake.ts";
import { buildSummaries, formatSummariesForContext } from "./summarizer.ts";

export type BriefType = "morning" | "midday" | "evening" | "message" | "geofence" | "boot";

function readFile(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

function getRecentJournal(): string {
  if (!existsSync(JOURNAL_DIR)) return "";
  const { readdirSync } = require("fs");
  const datePattern = /^\d{4}-\d{2}-\d{2}\.md$/;
  const files = readdirSync(JOURNAL_DIR)
    .filter((f: string) => datePattern.test(f))
    .sort()
    .reverse()
    .slice(0, 2);
  if (files.length === 0) return "";
  return files
    .map((f: string) => {
      const content = readFileSync(join(JOURNAL_DIR, f), "utf-8");
      return `## ${f.replace(".md", "")}\n\n${content}`;
    })
    .join("\n\n---\n\n");
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
      return parts.join("\n");
    }).join("\n");
  } catch {
    return "";
  }
}

/**
 * Assemble a full-context brief (morning, boot).
 * Includes state, journal, memory, inbox, calendar, knowledge, tasks.
 */
function assembleFullBrief(reason: string): string {
  const schedule = getSchedule();
  const maxTurns = schedule.agent?.maxTurns ?? 100;
  const today = new Date().toISOString().split("T")[0];
  const dayOfWeek = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const state = computeState();

  let message = `Good morning. It's ${today}, ${dayOfWeek}.\n\nYou have up to ${maxTurns} turns this session.\n\n## Your State\n\n${state}`;

  const journal = getRecentJournal();
  if (journal) {
    message += `\n\n---\n\n# Recent Journal\n\n${journal}`;
  }

  const memory = readFile(join(MIND_DIR, "MEMORY.md"));
  if (memory) {
    message += `\n\n---\n\n# Current Memory\n\n${memory}`;
  }

  const inbox = readFile(join(JOURNAL_DIR, "creator-inbox.md"));
  if (inbox.trim()) {
    message += `\n\n---\n\n# Message from Randy\n\n${inbox.trim()}`;
  }

  const prewake = gatherPrewakeContext();
  if (prewake) {
    message += `\n\n---\n\n# Today's Context\n\n${prewake}`;
  }

  const knowledge = (() => {
    const entries = buildSummaries();
    return entries.length > 0 ? formatSummariesForContext(entries) : "";
  })();
  if (knowledge) {
    message += `\n\n---\n\n# Knowledge Base (Summaries)\n\n${knowledge}`;
  }

  const consolidation = join(MIND_DIR, ".consolidation-needed.json");
  if (existsSync(consolidation)) {
    try {
      const data = JSON.parse(readFileSync(consolidation, "utf-8"));
      if (data.files?.length > 0) {
        message += `\n\n---\n\n# Journal Consolidation Needed\n\n${data.files.map((f: string) => `- \`journal/${f}\``).join("\n")}\n\n${data.reason}`;
      }
    } catch {}
  }

  const tasks = getPendingTasks();
  if (tasks) {
    message += `\n\n---\n\n# Pending Tasks\n\n${tasks}`;
  }

  message += `\n\n---\n\n## What To Do\n\n1. **Inbox first** — If Randy sent a message, that's highest priority.\n2. **Tasks** — Check for overdue or due-today items.\n3. **Calendar** — Any events in the next 2 hours needing prep?\n4. **Proactive** — Anything from memory or context worth following up on?\n\nIf nothing actionable — write a brief journal entry and stop.`;

  return message;
}

/**
 * Assemble a light brief (midday check).
 * Just state, inbox, calendar changes, task updates.
 */
function assembleLightBrief(): string {
  const state = computeState();
  let message = `Midday check.\n\n## State\n\n${state}`;

  const inbox = readFile(join(JOURNAL_DIR, "creator-inbox.md"));
  if (inbox.trim()) {
    message += `\n\n---\n\n# Message from Randy\n\n${inbox.trim()}`;
  }

  const prewake = gatherPrewakeContext();
  if (prewake) {
    message += `\n\n---\n\n# Upcoming\n\n${prewake}`;
  }

  const tasks = getPendingTasks();
  if (tasks) {
    message += `\n\n---\n\n# Pending Tasks\n\n${tasks}`;
  }

  message += `\n\nCheck for new emails. Flag anything important. Update tasks.`;

  return message;
}

/**
 * Assemble an evening wrap brief.
 */
function assembleEveningBrief(): string {
  const state = computeState();
  let message = `Evening wrap-up.\n\n## State\n\n${state}`;

  const inbox = readFile(join(JOURNAL_DIR, "creator-inbox.md"));
  if (inbox.trim()) {
    message += `\n\n---\n\n# Message from Randy\n\n${inbox.trim()}`;
  }

  const tasks = getPendingTasks();
  if (tasks) {
    message += `\n\n---\n\n# Pending Tasks\n\n${tasks}`;
  }

  message += `\n\nSummarize what you accomplished today. Flag anything that needs attention tomorrow. Update MEMORY.md with any significant changes.`;

  return message;
}

/**
 * Assemble a message-triggered brief.
 * Minimal context — just the message. Edith can read files if she needs more.
 */
function assembleMessageBrief(messageText: string): string {
  return messageText;
}

/**
 * Assemble a geofence-triggered brief.
 */
function assembleGeofenceBrief(locationName: string, reminderText: string): string {
  return `📍 Randy is near ${locationName}.\nReminder: ${reminderText}`;
}

/**
 * Main entry point — assemble the right brief for the event type.
 */
export function assembleBrief(
  type: BriefType,
  opts: { reason?: string; messageText?: string; locationName?: string; reminderText?: string } = {}
): string {
  switch (type) {
    case "morning":
    case "boot":
      return assembleFullBrief(opts.reason ?? type);
    case "midday":
      return assembleLightBrief();
    case "evening":
      return assembleEveningBrief();
    case "message":
      return assembleMessageBrief(opts.messageText ?? "");
    case "geofence":
      return assembleGeofenceBrief(opts.locationName ?? "unknown", opts.reminderText ?? "");
    default:
      return assembleFullBrief("unknown");
  }
}
