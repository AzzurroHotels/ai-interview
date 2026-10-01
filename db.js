import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

const DB_PATH = process.env.DB_PATH || "interview.db";
const UPLOAD_BASE = process.env.UPLOAD_DIR || "./uploads";

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
    migrate(db);
    ensureDir(path.join(UPLOAD_BASE, "tmp"));
    ensureDir(path.join(UPLOAD_BASE, "interviews"));
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
      slug TEXT NOT NULL DEFAULT 'receptionist',
      mode TEXT NOT NULL DEFAULT 'video',
      status TEXT NOT NULL DEFAULT 'submitted',
      total_questions INTEGER NOT NULL DEFAULT 0,
      current_question INTEGER NOT NULL DEFAULT 0,
      last_seen_at TEXT,
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

// Add new columns to databases created before the slug/abandon-tracking update
function migrate(db) {
  const cols = db.prepare("PRAGMA table_info(interviews)").all().map((c) => c.name);
  if (!cols.includes("slug")) {
    db.exec("ALTER TABLE interviews ADD COLUMN slug TEXT NOT NULL DEFAULT 'receptionist'");
  }
  if (!cols.includes("current_question")) {
    db.exec("ALTER TABLE interviews ADD COLUMN current_question INTEGER NOT NULL DEFAULT 0");
  }
  if (!cols.includes("last_seen_at")) {
    db.exec("ALTER TABLE interviews ADD COLUMN last_seen_at TEXT");
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_interviews_slug ON interviews(slug);
    CREATE INDEX IF NOT EXISTS idx_answers_interview ON interview_answers(interview_id);
  `);
}

// ---- Interview helpers ----

const insertInterviewStmt = () =>
  getDb().prepare(`
    INSERT INTO interviews (id, candidate_name, candidate_email, role, slug, mode, status, total_questions,
      current_question, last_seen_at, user_agent, device_hint, visibility_hidden_count, practice_rerecords,
      speed_ping_ms, speed_download_mbps, speed_upload_mbps, speed_rating)
    VALUES (@id, @candidate_name, @candidate_email, @role, @slug, @mode, @status, @total_questions,
      @current_question, datetime('now'), @user_agent, @device_hint, @visibility_hidden_count, @practice_rerecords,
      @speed_ping_ms, @speed_download_mbps, @speed_upload_mbps, @speed_rating)
  `);

export function createInterview(data) {
  const id = randomUUID();
  insertInterviewStmt().run({
    candidate_name: null,
    candidate_email: null,
    role: null,
    slug: "receptionist",
    mode: "video",
    status: "submitted",
    total_questions: 0,
    current_question: 0,
    user_agent: null,
    device_hint: null,
    visibility_hidden_count: 0,
    practice_rerecords: 0,
    speed_ping_ms: null,
    speed_download_mbps: null,
    speed_upload_mbps: null,
    speed_rating: null,
    ...data,
    id,
  });
  return getInterviewById(id);
}

export function getInterviewById(id) {
  return getDb().prepare("SELECT * FROM interviews WHERE id = ?").get(id);
}

const INTERVIEW_UPDATABLE = new Set([
  "candidate_name",
  "candidate_email",
  "role",
  "slug",
  "mode",
  "status",
  "total_questions",
  "current_question",
  "user_agent",
  "device_hint",
  "visibility_hidden_count",
  "practice_rerecords",
  "practice_storage_path",
  "practice_mime_type",
  "practice_duration_seconds",
  "speed_ping_ms",
  "speed_download_mbps",
  "speed_upload_mbps",
  "speed_rating",
]);

export function updateInterview(id, data) {
  const setClauses = [];
  const params = {};
  for (const [key, value] of Object.entries(data)) {
    if (!INTERVIEW_UPDATABLE.has(key)) continue;
    setClauses.push(`${key} = @${key}`);
    params[key] = value;
  }
  if (setClauses.length === 0) return null;
  params.id = id;
  getDb().prepare(`UPDATE interviews SET ${setClauses.join(", ")} WHERE id = @id`).run(params);
  return getInterviewById(id);
}

// Keep-alive for in-progress interviews (used to detect abandoned submissions)
export function touchInterview(id, data = {}) {
  const setClauses = ["last_seen_at = datetime('now')"];
  const params = { id };
  if (data.current_question != null && data.current_question !== "") {
    setClauses.push("current_question = @current_question");
    params.current_question = Number(data.current_question) || 0;
  }
  if (data.visibility_hidden_count != null && data.visibility_hidden_count !== "") {
    setClauses.push("visibility_hidden_count = @visibility_hidden_count");
    params.visibility_hidden_count = Number(data.visibility_hidden_count) || 0;
  }
  return getDb()
    .prepare(`UPDATE interviews SET ${setClauses.join(", ")} WHERE id = @id`)
    .run(params).changes;
}

export function abandonInterview(id) {
  return getDb()
    .prepare(
      "UPDATE interviews SET status = 'abandoned', last_seen_at = datetime('now') WHERE id = ? AND status = 'in_progress'"
    )
    .run(id).changes;
}

// Called before admin listings so stale in-progress sessions show as abandoned
export function markStaleInterviewsAbandoned(minutes = 3) {
  return getDb()
    .prepare(
      `UPDATE interviews SET status = 'abandoned'
       WHERE status = 'in_progress'
         AND COALESCE(last_seen_at, created_at) < datetime('now', ?)`
    )
    .run(`-${minutes} minutes`).changes;
}

export function listInterviews(slug) {
  const base = `
    SELECT i.*,
      (SELECT COUNT(*) FROM interview_answers a WHERE a.interview_id = i.id) AS answer_count
    FROM interviews i`;
  if (slug) {
    return getDb().prepare(`${base} WHERE i.slug = ? ORDER BY i.created_at DESC`).all(slug);
  }
  return getDb().prepare(`${base} ORDER BY i.created_at DESC`).all();
}

export function getInterviewCounts() {
  return getDb()
    .prepare("SELECT status, COUNT(*) AS count FROM interviews GROUP BY status")
    .all();
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
  insertAnswerStmt().run({
    question_text: "",
    followup_text: null,
    storage_path: "",
    mime_type: null,
    duration_seconds: null,
    ...data,
    id,
  });
  return getAnswerById(id);
}

export function getAnswerById(id) {
  return getDb().prepare("SELECT * FROM interview_answers WHERE id = ?").get(id);
}

export function getAnswerByInterviewAndIndex(interviewId, questionIndex) {
  return getDb()
    .prepare("SELECT * FROM interview_answers WHERE interview_id = ? AND question_index = ?")
    .get(interviewId, questionIndex);
}

export function getAnswersByInterviewId(interviewId) {
  return getDb()
    .prepare("SELECT * FROM interview_answers WHERE interview_id = ? ORDER BY question_index ASC")
    .all(interviewId);
}

const ANSWER_UPDATABLE = new Set([
  "question_text",
  "followup_text",
  "storage_path",
  "mime_type",
  "duration_seconds",
]);

export function updateAnswer(id, data) {
  const setClauses = [];
  const params = {};
  for (const [key, value] of Object.entries(data)) {
    if (!ANSWER_UPDATABLE.has(key)) continue;
    setClauses.push(`${key} = @${key}`);
    params[key] = value;
  }
  if (setClauses.length === 0) return null;
  params.id = id;
  getDb().prepare(`UPDATE interview_answers SET ${setClauses.join(", ")} WHERE id = @id`).run(params);
  return getAnswerById(id);
}

// ---- File helpers ----

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function getUploadDir(interviewId) {
  const dir = path.join(UPLOAD_BASE, "interviews", interviewId);
  ensureDir(dir);
  return dir;
}

export function getFileUrl(req, relativePath) {
  const host = req.get("host");
  const proto = req.protocol;
  return `${proto}://${host}/files/${relativePath}`;
}
