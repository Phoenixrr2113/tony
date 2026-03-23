import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { SOUL_DIR, SOUL_CONFIG_DIR } from "./paths.ts";
import { getBootDate, getDaysAlive } from "./schedule.ts";

function readFile(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

/**
 * Assemble system prompt from soul/ directory.
 * Loads: SOUL.md, IDENTITY.md, RANDY.md, config/protocols.md
 */
export function assembleSystemPrompt(): string {
  const soul = readFile(join(SOUL_DIR, "SOUL.md"));
  const identity = readFile(join(SOUL_DIR, "IDENTITY.md"));
  const randy = readFile(join(SOUL_DIR, "RANDY.md"));
  const protocols = readFile(join(SOUL_CONFIG_DIR, "protocols.md"));

  const bootDate = getBootDate();
  const daysAlive = getDaysAlive(bootDate);

  const filledIdentity = identity
    .replace("{{FIRST_BOOT_DATE}}", bootDate)
    .replace("{{DAYS_SINCE_BOOT}}", String(daysAlive));

  return [soul, filledIdentity, randy, protocols].filter(Boolean).join("\n\n---\n\n");
}
