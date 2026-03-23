import { readFileSync, writeFileSync, appendFileSync, existsSync } from "fs";
import { OFFSET_PATH, LOCATION_PATH, MESSAGES_LOG_PATH } from "./paths.ts";

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

/**
 * Send "typing..." indicator to Telegram chat.
 * Telegram typing indicators expire after 5 seconds, so re-call periodically.
 */
export async function sendTypingAction(): Promise<void> {
  const chatId = getEnv("TELEGRAM_CHAT_ID");
  try {
    await fetch(apiUrl("sendChatAction"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" }),
    });
  } catch {
    // Non-critical — silently ignore typing indicator failures
  }
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
  source?: "telegram" | "sms";
};

export type LocationUpdate = {
  lat: number;
  lng: number;
  timestamp: string;
  livePeriod?: number;
  expiresAt?: string;
};

async function transcribeVoiceMessage(fileId: string, durationSec: number): Promise<string | null> {
  // Try Groq (free Whisper), fall back to OpenAI
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  const sttProvider = groqKey
    ? { key: groqKey, url: "https://api.groq.com/openai/v1/audio/transcriptions", model: "whisper-large-v3", name: "Groq" }
    : openaiKey
    ? { key: openaiKey, url: "https://api.openai.com/v1/audio/transcriptions", model: "whisper-1", name: "OpenAI" }
    : null;

  if (!sttProvider) {
    console.log(`   🎙️  Voice message received (${durationSec}s) but no GROQ_API_KEY or OPENAI_API_KEY set — skipping`);
    return null;
  }

  try {
    // Step 1: Get file path from Telegram
    const fileRes = await fetch(apiUrl("getFile"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    });
    const fileData = (await fileRes.json()) as { ok: boolean; result?: { file_path: string } };
    if (!fileData.ok || !fileData.result?.file_path) {
      console.error(`   ❌ Could not get file path for voice message`);
      return null;
    }

    // Step 2: Download the audio file
    const token = getEnv("TELEGRAM_BOT_TOKEN");
    const audioUrl = `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`;
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      console.error(`   ❌ Could not download voice file: ${audioRes.status}`);
      return null;
    }
    const audioBlob = await audioRes.blob();

    // Step 3: Send to Whisper for transcription
    const formData = new FormData();
    formData.append("file", audioBlob, "voice.ogg");
    formData.append("model", sttProvider.model);

    const whisperRes = await fetch(sttProvider.url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${sttProvider.key}` },
      body: formData,
    });

    if (!whisperRes.ok) {
      const errText = await whisperRes.text();
      console.error(`   ❌ ${sttProvider.name} transcription failed: ${whisperRes.status} ${errText}`);
      return null;
    }

    const result = (await whisperRes.json()) as { text: string };
    console.log(`   🎙️  Transcribed ${durationSec}s voice via ${sttProvider.name}: "${result.text.slice(0, 80)}${result.text.length > 80 ? "..." : ""}"`);
    return result.text;
  } catch (err) {
    console.error(`   ❌ Voice transcription error:`, err instanceof Error ? err.message : err);
    return null;
  }
}

function saveLocation(location: LocationUpdate): void {
  writeFileSync(LOCATION_PATH, JSON.stringify(location, null, 2), "utf-8");
}

/**
 * Persist a message to logs/messages.jsonl BEFORE acknowledging the Telegram offset.
 * This ensures we never lose a message even if the daemon crashes mid-processing.
 */
function persistMessage(entry: {
  type: "text" | "voice" | "sms" | "location";
  from: string;
  text: string;
  timestamp: string;
  updateId: number;
}): void {
  const line = JSON.stringify(entry) + "\n";
  appendFileSync(MESSAGES_LOG_PATH, line, "utf-8");
}

function handleLocationMessage(msg: any): void {
  if (!msg?.location) return;
  const loc = msg.location;
  const now = new Date();
  const update: LocationUpdate = {
    lat: loc.latitude,
    lng: loc.longitude,
    timestamp: now.toISOString(),
  };
  if (loc.live_period) {
    update.livePeriod = loc.live_period;
    update.expiresAt = new Date(now.getTime() + loc.live_period * 1000).toISOString();
  }
  saveLocation(update);
  console.log(`📍 Location updated: ${update.lat.toFixed(4)}, ${update.lng.toFixed(4)}${loc.live_period ? ` (live, ${loc.live_period}s)` : ""}`);
}

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
        allowed_updates: ["message", "edited_message"],
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
        message?: any;
        edited_message?: any;
      }>;
    };

    if (!data.ok || !data.result.length) return [];

    const messages: TelegramMessage[] = [];
    let maxOffset = offset;

    const allowedUserId = getEnv("TELEGRAM_USER_ID");
    // Optional: SMS relay bot ID for two-bot SMS architecture
    const smsBotId = process.env.TELEGRAM_SMS_BOT_ID ?? "";

    for (const update of data.result) {
      if (update.update_id >= maxOffset) {
        maxOffset = update.update_id + 1;
      }

      // Handle both message and edited_message (live location sends edits)
      const msg = update.message ?? update.edited_message;
      if (!msg) continue;
      if (String(msg.chat?.id) !== chatId) continue;

      const senderId = String(msg.from?.id ?? "");
      const isRandy = senderId === allowedUserId;
      const isSmsBot = smsBotId && senderId === smsBotId;

      if (!isRandy && !isSmsBot) {
        console.log(`⛔ Rejected message from unknown user ${msg.from?.id} (${msg.from?.first_name ?? "?"})`);
        continue;
      }

      // Handle location updates (including live location edits)
      if (msg.location) {
        persistMessage({
          type: "location",
          from: msg.from?.first_name ?? "Unknown",
          text: `${msg.location.latitude},${msg.location.longitude}`,
          timestamp: new Date(msg.date * 1000).toISOString(),
          updateId: update.update_id,
        });
        handleLocationMessage(msg);
        continue; // Location-only messages don't go to inbox
      }

      // Handle voice messages
      if (msg.voice || msg.audio) {
        const fileId = msg.voice?.file_id ?? msg.audio?.file_id;
        const duration = msg.voice?.duration ?? msg.audio?.duration ?? 0;
        if (fileId) {
          const transcript = await transcribeVoiceMessage(fileId, duration);
          if (transcript) {
            const from = msg.from?.first_name ?? msg.from?.username ?? "Unknown";
            persistMessage({
              type: "voice",
              from,
              text: `[voice] ${transcript}`,
              timestamp: new Date(msg.date * 1000).toISOString(),
              updateId: update.update_id,
            });
            messages.push({
              from,
              text: `[voice] ${transcript}`,
              date: new Date(msg.date * 1000),
              source: "telegram",
            });
            continue;
          }
        }
      }

      // Text messages
      if (!msg.text) continue;

      // Detect SMS: messages from relay bot are always SMS, or legacy [SMS] prefix
      const isSms = isSmsBot || msg.text.startsWith("[SMS]");
      const from = isSmsBot ? "SMS Relay" : (msg.from?.first_name ?? msg.from?.username ?? "Unknown");

      persistMessage({
        type: isSms ? "sms" : "text",
        from,
        text: msg.text,
        timestamp: new Date(msg.date * 1000).toISOString(),
        updateId: update.update_id,
      });

      messages.push({
        from,
        text: msg.text,
        date: new Date(msg.date * 1000),
        source: isSms ? "sms" : "telegram",
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

