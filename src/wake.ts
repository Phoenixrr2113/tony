import { existsSync, readFileSync, appendFileSync } from "fs";
import { join } from "path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { MIND_DIR, TRANSCRIPTS_DIR, ROOT } from "./lib/paths.ts";
import { getSchedule } from "./lib/schedule.ts";
import { assembleSystemPrompt, assembleWakeMessage } from "./lib/context.ts";
import { buildIndex } from "./lib/indexer.ts";
import { ensureDirs, logWake } from "./lib/logger.ts";
import { checkCreatorInbox, checkCreatorOutbox, clearInbox } from "./lib/messaging.ts";
import { acquireLock, releaseLock } from "./lib/wakelock.ts";
import { runMaintenance } from "./lib/maintenance.ts";

export type WakeResult = {
  timestamp: string;
  reason: string;
  durationSeconds: number;
  exitCode: number | null;
  turns: number;
  idleKilled: boolean;
  outputLength: number;
};

function loadMcpServers(): Record<string, any> {
  const mcpConfigPath = join(ROOT, "mcp-config.json");
  if (!existsSync(mcpConfigPath)) return {};

  try {
    const config = JSON.parse(readFileSync(mcpConfigPath, "utf-8"));
    return config.mcpServers ?? {};
  } catch {
    return {};
  }
}

export async function wake(reason = "heartbeat"): Promise<WakeResult | null> {
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

async function _doWake(reason: string): Promise<WakeResult> {
  const maintenanceReport = runMaintenance();
  if (maintenanceReport.length > 0) {
    console.log(`🔧 Maintenance:\n${maintenanceReport.map(r => `  ${r}`).join("\n")}`);
  }

  await checkCreatorInbox();

  buildIndex();

  const schedule = getSchedule();
  const maxTurns = schedule.creature?.maxTurns ?? 100;
  const idleTimeout = (schedule.watchdog?.idleTimeoutSeconds ?? 300) * 1000;

  const systemPrompt = assembleSystemPrompt();
  const wakeMessage = assembleWakeMessage(reason);

  console.log(`\n🫀 Edith waking — reason: ${reason} — ${new Date().toISOString()}`);
  const startTime = Date.now();

  const allowedTools = [
    "Read", "Write", "Edit", "MultiEdit",
    "Bash", "Glob", "Grep", "WebFetch", "WebSearch", "Task",
  ];

  const wakeId = new Date().toISOString().replace(/[:.]/g, "-");
  const transcriptPath = join(TRANSCRIPTS_DIR, `${wakeId}.jsonl`);

  let lastActivityTime = Date.now();
  let turns = 0;
  let resultText = "(no output)";
  let idleKilled = false;
  let queryHandle: ReturnType<typeof query> | null = null;

  const idleTimer = setInterval(() => {
    const idleMs = Date.now() - lastActivityTime;
    if (idleMs >= idleTimeout) {
      console.log(`\n⏱️  Idle for ${Math.round(idleMs / 1000)}s — killing session.`);
      idleKilled = true;
      if (queryHandle) {
        queryHandle.close();
      }
      clearInterval(idleTimer);
    }
  }, 5000);

  try {
    queryHandle = query({
      prompt: wakeMessage,
      options: {
        systemPrompt,
        allowedTools,
        maxTurns,
        permissionMode: "bypassPermissions",
        cwd: MIND_DIR,
        mcpServers: loadMcpServers(),
      },
    });

    for await (const message of queryHandle) {
      const line = JSON.stringify(message);
      appendFileSync(transcriptPath, line + "\n", "utf-8");

      if (message.type === "assistant" && (message as any).message?.content) {
        lastActivityTime = Date.now();
        for (const block of (message as any).message.content) {
          if (block.type === "tool_use" || ("name" in block && block.name)) {
            turns++;
            const toolName = block.name ?? "unknown";
            console.log(`  🔧 [${turns}/${maxTurns}] ${toolName}`);
          }
          if ("text" in block && block.text) {
            resultText = block.text;
          }
        }
      }

      if (message.type === "result") {
        lastActivityTime = Date.now();
        const resultMsg = message as any;
        if (resultMsg.result) {
          resultText = resultMsg.result;
        }
      }
    }
  } catch (err: any) {
    if (!idleKilled) {
      console.error(`❌ Agent SDK error:`, err?.message ?? err);
    }
  } finally {
    clearInterval(idleTimer);
  }

  const duration = Math.round((Date.now() - startTime) / 1000);

  console.log(`\n💭 Edith: ${resultText.slice(0, 500)}`);
  console.log(`📝 Transcript: ${transcriptPath}`);

  const wakeLog: WakeResult = {
    timestamp: new Date().toISOString(),
    reason,
    durationSeconds: duration,
    exitCode: idleKilled ? 1 : 0,
    turns,
    idleKilled,
    outputLength: existsSync(transcriptPath) ? Bun.file(transcriptPath).size : 0,
  };

  logWake(wakeLog);

  if (idleKilled) {
    console.log(`\n⏱️  Edith went idle — session killed after ${duration}s\n`);
  } else {
    console.log(`\n😴 Edith finished — ${duration}s, ${turns} turns\n`);
  }

  await checkCreatorOutbox();
  clearInbox();

  return wakeLog;
}

if (import.meta.main) {
  const reason = process.argv[2] ?? "manual";
  await wake(reason);
}
