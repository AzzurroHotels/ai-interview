import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  getUploadDir,
  updateInterview,
  createAnswer,
  updateAnswer,
  getAnswerByInterviewAndIndex,
} from "../db.js";
import { enqueueAnswer } from "../lib/ai.js";

const router = Router();

// Temporary upload buffer
const upload = multer({
  dest: path.join(process.env.UPLOAD_DIR || "./uploads", "tmp"),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
});

router.post("/upload", upload.single("file"), (req, res) => {
  try {
    const { interviewId, type, questionIndex, questionId, questionText, followupText, durationSeconds } = req.body;
    const mimeType = req.body.mimeType || req.file?.mimetype || "video/webm";

    if (!interviewId || !req.file) {
      return res.status(400).json({ error: "Missing interviewId or file" });
    }

    const dir = getUploadDir(interviewId);
    const ext = (mimeType || "").includes("mp4") ? "mp4" : "webm";

    let filename;
    if (type === "practice") {
      filename = `practice.${ext}`;
    } else {
      const idx = String(Number(questionIndex) || 1).padStart(2, "0");
      const qid = (questionId || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
      filename = `q${idx}_${qid}.${ext}`;
    }

    const finalPath = path.join(dir, filename);
    fs.renameSync(req.file.path, finalPath);

    const relativePath = `interviews/${interviewId}/${filename}`;

    let answerId = null;
    if (type === "practice") {
      updateInterview(interviewId, {
        practice_storage_path: relativePath,
        practice_mime_type: mimeType,
        practice_duration_seconds: Number(durationSeconds) || 0,
      });
    } else {
      const idx = Number(questionIndex) || 0;
      const qid = (questionId || "").trim() || null;
      const existing = getAnswerByInterviewAndIndex(interviewId, idx);
      if (existing) {
        // Retry after a failed upload — replace the file reference instead of duplicating
        updateAnswer(existing.id, {
          question_id: qid || existing.question_id,
          question_text: questionText || existing.question_text,
          followup_text: followupText || existing.followup_text,
          storage_path: relativePath,
          mime_type: mimeType,
          duration_seconds: Number(durationSeconds) || 0,
          transcript: null,
          transcript_status: "pending",
          transcript_error: null,
          transcribed_at: null,
          grade_json: null,
          grade_score: null,
          grade_status: "pending",
          grade_error: null,
          graded_at: null,
        });
        answerId = existing.id;
      } else {
        const created = createAnswer({
          interview_id: interviewId,
          question_index: idx,
          question_id: qid,
          question_text: questionText || "",
          followup_text: followupText || "",
          storage_path: relativePath,
          mime_type: mimeType,
          duration_seconds: Number(durationSeconds) || 0,
        });
        answerId = created.id;
      }
    }

    res.json({ ok: true, path: relativePath });

    // Transcribe + auto-grade in the background (serial queue, never blocks the upload)
    if (answerId) enqueueAnswer(answerId);
  } catch (e) {
    // Clean up temp file on error
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
    console.error("Upload error:", e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
