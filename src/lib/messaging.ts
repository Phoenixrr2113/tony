import { appendFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import { INBOX_PATH, OUTBOX_PATH, ARCHIVE_PATH } from "./paths.ts";
import { sendTelegramMessage, pollTelegramMessages, type TelegramMessage } from "./telegram.ts";

export function writeMessagesToInbox(messages: TelegramMessage[]) {
  if (messages.length === 0) return;

  const formatted = messages
    .map((m) => `**${m.from}** (${m.date.toISOString()}):\n${m.text}`)
    .join("\n\n---\n\n");

  const existing = existsSync(INBOX_PATH) ? readFileSync(INBOX_PATH, "utf-8").trim() : "";
  const combined = existing ? `${existing}\n\n---\n\n${formatted}` : formatted;
  writeFileSync(INBOX_PATH, combined, "utf-8");

  for (const m of messages) {
    appendFileSync(ARCHIVE_PATH, `\n--- INBOUND ${m.date.toISOString()} ---\n${m.text}\n`, "utf-8");
  }

  console.log(`📬 ${messages.length} message(s) from Randy → creator-inbox.md`);
}

export async function checkCreatorInbox() {
  const messages = await pollTelegramMessages();
  writeMessagesToInbox(messages);
}

export async function checkCreatorOutbox() {
  if (!existsSync(OUTBOX_PATH)) return;

  const content = readFileSync(OUTBOX_PATH, "utf-8").trim();
  if (!content) return;

  console.log(`\n📨 EDITH → RANDY:\n${content}\n`);

  const sent = await sendTelegramMessage(`🤖 *EDITH*\n\n${content}`);
  if (sent) {
    console.log(`✅ Delivered via Telegram`);
  } else {
    console.log(`⚠️  Telegram delivery failed — message archived only`);
  }

  appendFileSync(ARCHIVE_PATH, `\n--- ${new Date().toISOString()} ---\n${content}\n`, "utf-8");
  Bun.write(OUTBOX_PATH, "");
}

export function clearInbox() {
  if (!existsSync(INBOX_PATH)) return;
  const content = readFileSync(INBOX_PATH, "utf-8").trim();
  if (content) {
    Bun.write(INBOX_PATH, "");
  }
}

