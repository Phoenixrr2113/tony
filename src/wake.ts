import { existsSync, writeFileSync } from "fs";
import { join } from "path";
import { MIND_DIR, TRANSCRIPTS_DIR } from "./lib/paths.ts";
import { getSchedule } from "./lib/schedule.ts";
import { assembleSystemPrompt, assembleWakeMessage } from "./lib/context.ts";
import { buildIndex } from "./lib/indexer.ts";
import { ensureDirs, logWake } from "./lib/logger.ts";
import { checkCreatorInbox, checkCreatorOutbox, clearInbox } from "./lib/messaging.ts";
import { acquireLock, releaseLock } from "./lib/wakelock.ts";
import { runMaintenance } from "./lib/maintenance.ts";

export async function wake(reason = "heartbeat") {
  ensureDirs();

  if (!acquireLock()) {
    console.log(`⏭️  Skipping wake — another wake is still running.`);
    return null;
  }

  try {
    return await _doWake(reason);
  } finally {
    releaseLock();
  }
}

async function _doWake(reason: string) {
  const maintenanceReport = runMaintenance();
  if (maintenanceReport.length > 0) {
    console.log(`🔧 Maintenance:\n${maintenanceReport.map(r => `  ${r}`).join("\n")}`);
  }

  await checkCreatorInbox();

  buildIndex();

  const schedule = getSchedule();
  const maxTurns = schedule.creature?.maxTurns ?? 25;

  const systemPrompt = assembleSystemPrompt();
  const wakeMessage = assembleWakeMessage(reason);

  console.log(`\n🫀 Edith waking — reason: ${reason} — ${new Date().toISOString()}`);
  const startTime = Date.now();

  const allowedTools = [
    "Read", "Write", "Edit", "MultiEdit",
    "Bash", "Glob", "Grep", "WebFetch", "Task",
  ];

  const args = [
    "claude",
    "-p", wakeMessage,
    "--system-prompt", systemPrompt,
    "--max-turns", String(maxTurns),
    "--output-format", "stream-json",
    "--verbose",
    "--dangerously-skip-permissions",
    "--allowedTools", allowedTools.join(","),
  ];

  let proc;
  try {
    proc = Bun.spawn(args, {
      cwd: MIND_DIR,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        PATH: `/opt/homebrew/bin:${process.env.HOME}/.bun/bin:${process.env.PATH}`,
      },
    });
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      throw new Error("claude CLI not found in PATH. Install Claude Code: https://code.claude.com");
    }
    throw err;
  }

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  const duration = Math.round((Date.now() - startTime) / 1000);

  const wakeId = `${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const transcriptPath = join(TRANSCRIPTS_DIR, `${wakeId}.jsonl`);
  writeFileSync(transcriptPath, stdout, "utf-8");

  const events = stdout.trim().split("\n").filter(Boolean);
  let resultText = "(no output)";
  for (const line of events) {
    try {
      const event = JSON.parse(line);
      if (event.type === "result" && event.result) {
        resultText = event.result;
      }
    } catch {}
  }

  if (stderr.trim()) {
    console.error(`⚠️  stderr: ${stderr.slice(0, 500)}`);
  }

  console.log(`\n💭 Edith: ${resultText.slice(0, 500)}`);
  console.log(`📝 Transcript: ${transcriptPath}`);

  const wakeLog = {
    timestamp: new Date().toISOString(),
    reason,
    durationSeconds: duration,
    exitCode: proc.exitCode,
    outputLength: stdout.length,
  };

  logWake(wakeLog);
  console.log(`\n😴 Edith sleeping — ${duration}s wake\n`);

  await checkCreatorOutbox();

  clearInbox();

  return wakeLog;
}

if (import.meta.main) {
  const reason = process.argv[2] ?? "manual";
  await wake(reason);
}

