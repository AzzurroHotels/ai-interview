import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { getDb, updateAnswer } from "../db.js";
import { findRubric } from "./rubrics.js";

const execFileP = promisify(execFile);
const FFMPEG = process.env.FFMPEG_BIN || "ffmpeg";
const GROQ_BASE = "https://api.groq.com/openai/v1";
const GROQ_URL = `${GROQ_BASE}/audio/transcriptions`;
const GROQ_MODEL = process.env.GROQ_MODEL || "whisper-large-v3-turbo";
const DEEPSEEK_BASE = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const GRADING_PROVIDER = (process.env.GRADING_PROVIDER || "groq").toLowerCase();
const GROQ_GRADING_MODEL = process.env.GROQ_GRADING_MODEL || "openai/gpt-oss-120b";
const UPLOAD_BASE = process.env.UPLOAD_DIR || "./uploads";

function groqKey() {
  return process.env.GROQ_API_KEY || "";
}

function deepseekKey() {
  return process.env.DEEPSEEK_API_KEY || "";
}

function gradingConfig() {
  if (GRADING_PROVIDER === "deepseek") {
    return {
      provider: "deepseek",
      url: `${DEEPSEEK_BASE}/chat/completions`,
      key: deepseekKey(),
      model: DEEPSEEK_MODEL,
    };
  }
  return {
    provider: "groq",
    url: `${GROQ_BASE}/chat/completions`,
    key: groqKey(),
    model: GROQ_GRADING_MODEL,
  };
}

export function aiConfigured() {
  const grading = gradingConfig();
  return {
    groq: !!groqKey(),
    gradingProvider: grading.provider,
    gradingModel: grading.model,
    gradingKey: !!grading.key,
    deepseek: !!deepseekKey(),
  };
}

let ffmpegChecked = null;
async function ffmpegAvailable() {
  if (ffmpegChecked !== null) return ffmpegChecked;
  try {
    await execFileP(FFMPEG, ["-version"]);
    ffmpegChecked = true;
  } catch {
    ffmpegChecked = false;
  }
  return ffmpegChecked;
}

// Extract an mp3 audio track from a recorded webm/mp4 so it can be transcribed.
export async function extractAudio(videoPath) {
  if (!(await ffmpegAvailable())) {
    throw new Error("Video recording needs ffmpeg on the server, which is not installed yet.");
  }
  const dir = path.join(os.tmpdir(), "interview-audio");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${path.basename(videoPath, path.extname(videoPath))}-${Date.now()}.mp3`);
  try {
    await execFileP(FFMPEG, ["-y", "-i", videoPath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", out]);
    return out;
  } catch (e) {
    throw new Error(`ffmpeg audio extraction failed: ${e.message}`);
  }
}

// Transcribe a recording through Groq Whisper. Retries on 429 (rate limit)
// and 5xx so a blip doesn't need a manual retry from admin.
export async function transcribeFile(filePath, mimeType) {
  const key = groqKey();
  if (!key) throw new Error("GROQ_API_KEY not configured");

  const isVideo = /^video\//.test(mimeType || "");
  let audioPath = filePath;
  let tempPath = null;
  if (isVideo) {
    audioPath = await extractAudio(filePath);
    tempPath = audioPath;
  }

  try {
    const buf = fs.readFileSync(audioPath);
    const outMime = isVideo ? "audio/mpeg" : mimeType || "application/octet-stream";
    const filename = isVideo ? "answer.mp3" : path.basename(audioPath);

    const MAX_ATTEMPTS = 4;
    let lastErr;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let res;
      try {
        const form = new FormData();
        form.append("model", GROQ_MODEL);
        form.append("language", "en");
        form.append("response_format", "text");
        form.append("file", new Blob([buf], { type: outMime }), filename);

        res = await fetch(GROQ_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: form,
        });
      } catch (networkErr) {
        lastErr = networkErr;
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        throw lastErr;
      }

      if (res.ok) {
        const text = ((await res.text()) || "").trim();
        if (!text) throw new Error("Groq returned an empty transcript"); // terminal
        return text;
      }

      const bodyText = await res.text();
      const retriable = res.status === 429 || res.status >= 500;
      lastErr = new Error(`Groq transcription failed (${res.status}): ${bodyText.slice(0, 300)}`);
      if (!retriable || attempt >= MAX_ATTEMPTS - 1) throw lastErr;

      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * (attempt + 1);
      await new Promise((r) => setTimeout(r, waitMs));
    }
    throw lastErr || new Error("Groq transcription failed after retries");
  } finally {
    if (tempPath) {
      try { fs.unlinkSync(tempPath); } catch {}
    }
  }
}

// The grader treats ASR slips as transcription noise, not candidate errors.
const GRADING_INSTRUCTIONS = `You are a strict but fair HR grader for Azzurro Hotels.
The candidate answered an interview question by voice recording. You receive the question text, the rubric key
points a good answer should include, and the candidate's transcript (speech-to-text, may contain filler words
or transcription errors).

The transcript comes from automatic speech-to-text, so tool/product names are frequently mis-transcribed
phonetically — treat these as the intended term, not as errors in the candidate's answer:
- "Cloudbeds" may appear as "CloudBits", "Cloud Beds", "Cloud Best", "Cloud Bids" or similar
- "GOKI" may appear as "Goki", "Go Key", "Gokey", "Go-Key" or similar
- "GHL" may appear as "G H L", "Go High Level", "Gee Aitch El" or similar
Judge the content of the answer, not whether these names were transcribed correctly.

For EVERY rubric point return a mark of:
- 1  when the candidate clearly covered the point (including reasonable paraphrasing),
- 0.5 when the point was partially covered or implied,
- 0  when it was missing or contradicted.
Do not be overly strict about wording. Never give points for content that is absent.

Respond ONLY with a JSON object:
{"verdicts":[{"point":"<the rubric point text>","mark":0|0.5|1,"note":"<1 short sentence why>"}],"summary":"<2-3 sentence overall assessment of this answer>"}`;

export async function gradeAnswer(questionText, points, transcript) {
  const cfg = gradingConfig();
  if (!cfg.key) throw new Error(`${cfg.provider.toUpperCase()} API key not configured for grading`);

  const numbered = points.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const user = `QUESTION: ${questionText}
RUBRIC KEY POINTS:
${numbered}

CANDIDATE TRANSCRIPT:
"""${(transcript || "").slice(0, 12000)}"""`;

  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(cfg.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: cfg.model,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: GRADING_INSTRUCTIONS },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${cfg.provider} grading failed (${res.status}): ${text.slice(0, 300)}`);
      }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || "";
      return JSON.parse(content.replace(/```json|```/g, "").trim());
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastErr || new Error(`${cfg.provider} grading failed after retries`);
}

export function computeScore(verdicts) {
  const total = verdicts.length || 1;
  const sum = verdicts.reduce((acc, v) => acc + (typeof v.mark === "number" ? v.mark : 0), 0);
  return Math.round((sum / total) * 100);
}

// Transcribe one answer, then grade it against its rubric (if one exists).
export async function processAnswer(answerId) {
  const db = getDb();
  let answer = db.prepare("SELECT * FROM interview_answers WHERE id = ?").get(answerId);
  if (!answer) return { ok: false, error: "Answer not found" };

  const filePath = path.join(UPLOAD_BASE, answer.storage_path);
  if (!fs.existsSync(filePath)) {
    updateAnswer(answerId, { transcript_status: "error", transcript_error: "Recording file not found on disk" });
    return { ok: false, error: "file missing" };
  }

  // 1) Transcribe
  if (!answer.transcript) {
    updateAnswer(answerId, { transcript_status: "transcribing", transcript_error: null });
    try {
      const transcript = await transcribeFile(filePath, answer.mime_type);
      updateAnswer(answerId, {
        transcript,
        transcript_status: "done",
        transcript_error: null,
        transcribed_at: new Date().toISOString(),
      });
      answer.transcript = transcript;
    } catch (e) {
      updateAnswer(answerId, {
        transcript_status: "error",
        transcript_error: String(e.message || e).slice(0, 500),
      });
      return { ok: false, error: String(e.message || e) };
    }
  } else if (answer.transcript_status !== "done") {
    updateAnswer(answerId, { transcript_status: "done", transcript_error: null });
  }

  // 2) Grade against the rubric for this question, when one is defined
  const rubric = findRubric({ questionId: answer.question_id, questionText: answer.question_text });
  if (!rubric) {
    updateAnswer(answerId, { grade_status: "skipped", grade_error: null });
    return { ok: true, graded: false };
  }

  updateAnswer(answerId, { grade_status: "grading", grade_error: null });
  try {
    const verdict = await gradeAnswer(answer.question_text, rubric.points, answer.transcript);
    const score = computeScore(verdict.verdicts || []);
    updateAnswer(answerId, {
      grade_json: JSON.stringify(verdict),
      grade_score: score,
      grade_status: "graded",
      grade_error: null,
      graded_at: new Date().toISOString(),
    });
    return { ok: true, graded: true, score };
  } catch (e) {
    updateAnswer(answerId, {
      grade_status: "error",
      grade_error: String(e.message || e).slice(0, 500),
    });
    return { ok: false, error: String(e.message || e) };
  }
}

// All transcription/grading runs through one queue so a burst of uploads
// (e.g. the receptionist flow uploading 4 clips at once) doesn't trip
// Groq/DeepSeek rate limits.
let queue = Promise.resolve();
let queued = 0;

export function queueSize() {
  return queued;
}

export function enqueueAnswer(answerId) {
  queued += 1;
  queue = queue
    .then(() => processAnswer(answerId))
    .catch((e) => console.error(`[ai] answer ${answerId} processing failed:`, e.message))
    .finally(() => {
      queued -= 1;
    });
  return queue;
}
