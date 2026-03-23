import { existsSync, readFileSync, appendFileSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { MIND_DIR, TRANSCRIPTS_DIR, ROOT, SESSION_STATE_PATH, SIGNAL_RESTART_PATH } from "./lib/paths.ts";
import { getSchedule } from "./lib/schedule.ts";
import { assembleSystemPrompt, assembleWakeMessage } from "./lib/context.ts";
import { buildIndex } from "./lib/indexer.ts";
import { ensureDirs, logWake } from "./lib/logger.ts";
import { checkCreatorInbox, checkCreatorOutbox, clearInbox } from "./lib/messaging.ts";
import { acquireLock, releaseLock } from "./lib/wakelock.ts";
import { runMaintenance } from "./lib/maintenance.ts";
import { setActiveQuery } from "./lib/session.ts";

export type WakeResult = {
  timestamp: string;
  reason: string;
  durationSeconds: number;
  exitCode: number | null;
  turns: number;
  idleKilled: boolean;
  outputLength: number;
  sessionId?: string;
  continued: boolean;
};

type SessionState = {
  sessionId: string;
  lastUpdated: string;
};

function loadSessionState(): SessionState | null {
  if (!existsSync(SESSION_STATE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(SESSION_STATE_PATH, "utf-8"));
  } catch {
    return null;
  }
}

function saveSessionState(sessionId: string): void {
  const state: SessionState = { sessionId, lastUpdated: new Date().toISOString() };
  writeFileSync(SESSION_STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * Check if Edith requested a fresh session via signal file.
 * Consumes the signal (deletes the file) and returns true if fresh start requested.
 */
function consumeRestartSignal(): boolean {
  if (!existsSync(SIGNAL_RESTART_PATH)) return false;
  try {
    const signal = JSON.parse(readFileSync(SIGNAL_RESTART_PATH, "utf-8"));
    unlinkSync(SIGNAL_RESTART_PATH);
    console.log(`🔄 Fresh session signal: ${signal.reason ?? "no reason given"}`);
    return signal.fresh === true;
  } catch {
    try { unlinkSync(SIGNAL_RESTART_PATH); } catch {}
    return false;
  }
}

function loadMcpServers(skipGraphiti = false): Record<string, any> {
  const mcpConfigPath = join(ROOT, "mcp-config.json");
  if (!existsSync(mcpConfigPath)) return {};

  try {
    const config = JSON.parse(readFileSync(mcpConfigPath, "utf-8"));
    const servers = config.mcpServers ?? {};
    if (skipGraphiti && "graphiti-memory" in servers) {
      console.log(`   ⚠️  Graphiti unavailable — running without long-term memory`);
      const { "graphiti-memory": _, ...rest } = servers;
      return rest;
    }
    return servers;
  } catch {
    return {};
  }
}

export type WakeOptions = {
  forceFresh?: boolean;
  skipGraphiti?: boolean;
};

export async function wake(reason = "heartbeat", opts: WakeOptions = {}): Promise<WakeResult | null> {
  ensureDirs();

  if (!acquireLock()) {
    console.log(`⏭️  Skipping wake — another wake is still running.`);
    return null;
  }

  try {
    return await _doWake(reason, opts);
  } finally {
    releaseLock();
  }
}

async function _doWake(reason: string, opts: WakeOptions = {}): Promise<WakeResult> {
  const { forceFresh = false, skipGraphiti = false } = opts;
  const maintenanceReport = runMaintenance();
  if (maintenanceReport.length > 0) {
    console.log(`🔧 Maintenance:\n${maintenanceReport.map(r => `  ${r}`).join("\n")}`);
  }

  // Check if Edith requested a fresh session
  const signalFresh = consumeRestartSignal();
  const skipContinue = forceFresh || signalFresh;

  await checkCreatorInbox();

  buildIndex();

  const schedule = getSchedule();
  const maxTurns = schedule.agent?.maxTurns ?? 100;
  const idleTimeout = (schedule.watchdog?.idleTimeoutSeconds ?? 300) * 1000;

  const systemPrompt = assembleSystemPrompt();
  const wakeMessage = assembleWakeMessage(reason);

  // Session continuity: resume previous session unless fresh start requested
  const previousSession = loadSessionState();
  const shouldContinue = !skipContinue && previousSession !== null;

  console.log(`\n🫀 Edith waking — reason: ${reason} — ${new Date().toISOString()}`);
  if (shouldContinue) {
    console.log(`   📎 Continuing session: ${previousSession!.sessionId.slice(0, 8)}...`);
  } else {
    console.log(`   🆕 Starting fresh session${skipContinue ? " (requested)" : ""}`);
  }
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
  let currentSessionId: string | undefined;
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

  // Poll outbox during session so messages get sent immediately
  const outboxWatcher = setInterval(async () => {
    try {
      await checkCreatorOutbox();
    } catch {}
  }, 3_000);

  try {
    queryHandle = query({
      prompt: wakeMessage,
      options: {
        systemPrompt,
        allowedTools,
        maxTurns,
        permissionMode: "bypassPermissions",
        cwd: MIND_DIR,
        mcpServers: loadMcpServers(skipGraphiti),
        ...(shouldContinue ? { continue: true } : {}),
      },
    });

    // Expose query handle for real-time message injection
    setActiveQuery(queryHandle);

    for await (const message of queryHandle) {
      const line = JSON.stringify(message);
      appendFileSync(transcriptPath, line + "\n", "utf-8");

      // Track session ID from any message that has one
      if ("session_id" in message && (message as any).session_id) {
        const sid = (message as any).session_id;
        if (sid !== currentSessionId) {
          currentSessionId = sid;
          saveSessionState(sid);
          console.log(`   📎 Session ID: ${sid.slice(0, 8)}...`);
        }
      }

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
    setActiveQuery(null);
    clearInterval(idleTimer);
    clearInterval(outboxWatcher);
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
    sessionId: currentSessionId,
    continued: shouldContinue,
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
