import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { WAKE_LOCK_PATH } from "./paths.ts";

interface LockInfo {
  pid: number;
  startedAt: string;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function acquireLock(): boolean {
  if (existsSync(WAKE_LOCK_PATH)) {
    try {
      const lock: LockInfo = JSON.parse(readFileSync(WAKE_LOCK_PATH, "utf-8"));

      if (isProcessAlive(lock.pid)) {
        const elapsed = Math.round((Date.now() - new Date(lock.startedAt).getTime()) / 1000);
        console.log(`🔒 Wake lock held by PID ${lock.pid} (${elapsed}s ago). Skipping.`);
        return false;
      }

      console.log(`🔓 Stale lock from PID ${lock.pid} (dead). Reclaiming.`);
    } catch {
      console.log(`🔓 Corrupt lock file. Reclaiming.`);
    }
  }

  const lock: LockInfo = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };

  writeFileSync(WAKE_LOCK_PATH, JSON.stringify(lock), "utf-8");
  return true;
}

export function releaseLock(): void {
  try {
    if (existsSync(WAKE_LOCK_PATH)) {
      const lock: LockInfo = JSON.parse(readFileSync(WAKE_LOCK_PATH, "utf-8"));
      if (lock.pid === process.pid) {
        unlinkSync(WAKE_LOCK_PATH);
      }
    }
  } catch {}
}

export function isWakeLocked(): boolean {
  if (!existsSync(WAKE_LOCK_PATH)) return false;

  try {
    const lock: LockInfo = JSON.parse(readFileSync(WAKE_LOCK_PATH, "utf-8"));
    return isProcessAlive(lock.pid);
  } catch {
    return false;
  }
}

