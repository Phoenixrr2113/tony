/**
 * Shared active session state.
 * The daemon and wake module both access this to coordinate
 * real-time message injection via streamInput().
 */
import type { query } from "@anthropic-ai/claude-agent-sdk";

type QueryHandle = ReturnType<typeof query>;

let activeQuery: QueryHandle | null = null;

export function setActiveQuery(q: QueryHandle | null): void {
  activeQuery = q;
}

export function getActiveQuery(): QueryHandle | null {
  return activeQuery;
}

export function isSessionRunning(): boolean {
  return activeQuery !== null;
}
