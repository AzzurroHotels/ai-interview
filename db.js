import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

const DB_PATH = process.env.DB_PATH || "interview.db";

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
  }
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS interviews (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      candidate_name TEXT NOT NULL,
      candidate_email TEXT,
      role TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'video',
      status TEXT NOT NULL DEFAULT 'submitted',
      total_questions INTEGER NOT NULL DEFAULT 0,
      user_agent TEXT,
      device_hint TEXT,
      visibility_hidden_count INTEGER NOT NULL DEFAULT 0,
      practice_rerecords INTEGER NOT NULL DEFAULT 0,
      practice_storage_path TEXT,
      practice_mime_type TEXT,
      practice_duration_seconds INTEGER,
      speed_ping_ms INTEGER,
      speed_download_mbps REAL,
      speed_upload_mbps REAL,
      speed_rating TEXT
    );

    CREATE TABLE IF NOT EXISTS interview_answers (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      interview_id TEXT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
      question_index INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      followup_text TEXT,
      storage_path TEXT NOT NULL,
      mime_type TEXT,
      duration_seconds INTEGER
    );
  `);
}

// ---- Interview helpers ----

const insertInterviewStmt = () =>
  getDb().prepare(`
    INSERT INTO interviews (id, candidate_name, candidate_email, role, mode, status, total_questions,
      user_agent, device_hint, visibility_hidden_count, practice_rerecords,
      speed_ping_ms, speed_download_mbps, speed_upload_mbps, speed_rating)
    VALUES (@id, @candidate_name, @candidate_email, @role, @mode, @status, @total_questions,
      @user_agent, @device_hint, @visibility_hidden_count, @practice_rerecords,
      @speed_ping_ms, @speed_download_mbps, @speed_upload_mbps, @speed_rating)
  `);

export function createInterview(data) {
  const id = randomUUID();
  insertInterviewStmt().run({ id, ...data });
  return getInterviewById(id);
}

export function getInterviewById(id) {
  return getDb().prepare("SELECT * FROM interviews WHERE id = ?").get(id);
}

export function updateInterview(id, data) {
  const setClauses = [];
  const params = {};
  for (const [key, value] of Object.entries(data)) {
    setClauses.push(`${key} = @${key}`);
    params[key] = value;
  }
  params.id = id;
  if (setClauses.length === 0) return null;
  getDb().prepare(`UPDATE interviews SET ${setClauses.join(", ")} WHERE id = @id`).run(params);
  return getInterviewById(id);
}

// ---- Answer helpers ----

const insertAnswerStmt = () =>
  getDb().prepare(`
    INSERT INTO interview_answers (id, interview_id, question_index, question_text,
      followup_text, storage_path, mime_type, duration_seconds)
    VALUES (@id, @interview_id, @question_index, @question_text,
      @followup_text, @storage_path, @mime_type, @duration_seconds)
  `);

export function createAnswer(data) {
  const id = randomUUID();
  insertAnswerStmt().run({ id, ...data });
  return getAnswerById(id);
}

export function getAnswerById(id) {
  return getDb().prepare("SELECT * FROM interview_answers WHERE id = ?").get(id);
}

export function getAnswersByInterviewId(interviewId) {
  return getDb()
    .prepare("SELECT * FROM interview_answers WHERE interview_id = ? ORDER BY question_index ASC")
    .all(interviewId);
}

// ---- File helpers ----

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function getUploadDir(interviewId) {
  const base = process.env.UPLOAD_DIR || "./uploads";
  const dir = path.join(base, "interviews", interviewId);
  ensureDir(dir);
  return dir;
}

export function getFileUrl(req, relativePath) {
  const host = req.get("host");
  const proto = req.protocol;
  return `${proto}://${host}/files/${relativePath}`;
}
