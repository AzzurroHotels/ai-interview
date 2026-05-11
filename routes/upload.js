import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { getUploadDir, updateInterview, createAnswer } from "../db.js";

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

    if (type === "practice") {
      updateInterview(interviewId, {
        practice_storage_path: relativePath,
        practice_mime_type: mimeType,
        practice_duration_seconds: Number(durationSeconds) || 0,
      });
    } else {
      createAnswer({
        interview_id: interviewId,
        question_index: Number(questionIndex) || 0,
        question_text: questionText || "",
        followup_text: followupText || "",
        storage_path: relativePath,
        mime_type: mimeType,
        duration_seconds: Number(durationSeconds) || 0,
      });
    }

    res.json({ ok: true, path: relativePath });
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
