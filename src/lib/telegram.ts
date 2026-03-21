import { readFileSync, writeFileSync, existsSync } from "fs";
import { OFFSET_PATH } from "./paths.ts";

function getEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env var: ${key}. Set it in .env`);
  return val;
}

function apiUrl(method: string): string {
  return `https://api.telegram.org/bot${getEnv("TELEGRAM_BOT_TOKEN")}/${method}`;
}

function getLastOffset(): number {
  if (!existsSync(OFFSET_PATH)) return 0;
  const raw = readFileSync(OFFSET_PATH, "utf-8").trim();
  return raw ? parseInt(raw, 10) : 0;
}

function saveOffset(offset: number): void {
  writeFileSync(OFFSET_PATH, String(offset), "utf-8");
}

export async function sendTelegramMessage(text: string): Promise<boolean> {
  const chatId = getEnv("TELEGRAM_CHAT_ID");
  try {
    const res = await fetch(apiUrl("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`❌ Telegram send failed: ${res.status} ${body}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`❌ Telegram send error:`, err);
    return false;
  }
}

export type TelegramMessage = {
  from: string;
  text: string;
  date: Date;
};

export async function pollTelegramMessages(): Promise<TelegramMessage[]> {
  const chatId = getEnv("TELEGRAM_CHAT_ID");
  const offset = getLastOffset();

  try {
    const res = await fetch(apiUrl("getUpdates"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offset: offset > 0 ? offset : undefined,
        timeout: 0,
        allowed_updates: ["message"],
      }),
    });

    if (!res.ok) {
      console.error(`❌ Telegram poll failed: ${res.status}`);
      return [];
    }

    const data = (await res.json()) as {
      ok: boolean;
      result: Array<{
        update_id: number;
        message?: {
          chat: { id: number };
          from?: { first_name?: string; username?: string };
          text?: string;
          date: number;
        };
      }>;
    };

    if (!data.ok || !data.result.length) return [];

    const messages: TelegramMessage[] = [];
    let maxOffset = offset;

    const allowedUserId = getEnv("TELEGRAM_USER_ID");

    for (const update of data.result) {
      if (update.update_id >= maxOffset) {
        maxOffset = update.update_id + 1;
      }
      const msg = update.message;
      if (!msg?.text) continue;
      if (String(msg.chat.id) !== chatId) continue;

      if (String(msg.from?.id) !== allowedUserId) {
        console.log(`⛔ Rejected message from unknown user ${msg.from?.id} (${msg.from?.first_name ?? "?"})`);
        continue;
      }

      messages.push({
        from: msg.from?.first_name ?? msg.from?.username ?? "Unknown",
        text: msg.text,
        date: new Date(msg.date * 1000),
      });
    }

    if (maxOffset > offset) {
      saveOffset(maxOffset);
    }

    return messages;
  } catch (err) {
    console.error(`❌ Telegram poll error:`, err);
    return [];
  }
}

