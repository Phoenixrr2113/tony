import { join, resolve } from "path";

export const ROOT = resolve(import.meta.dir, "..", "..");
export const MIND_DIR = join(ROOT, "mind");
export const LOGS_DIR = join(ROOT, "logs");
export const TRANSCRIPTS_DIR = join(LOGS_DIR, "transcripts");
export const JOURNAL_DIR = join(MIND_DIR, "journal");
export const JOURNAL_ARCHIVE_DIR = join(JOURNAL_DIR, "archive");
export const KNOWLEDGE_DIR = join(MIND_DIR, "knowledge");
export const INDEX_PATH = join(KNOWLEDGE_DIR, ".index.json");
export const INBOX_PATH = join(JOURNAL_DIR, "creator-inbox.md");
export const OUTBOX_PATH = join(JOURNAL_DIR, "creator-outbox.md");
export const ARCHIVE_PATH = join(LOGS_DIR, "creator-messages.log");
export const OFFSET_PATH = join(LOGS_DIR, "telegram-offset.txt");
export const WAKE_LOCK_PATH = join(LOGS_DIR, ".wake-lock");
export const MEMORY_PATH = join(MIND_DIR, "MEMORY.md");

