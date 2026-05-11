import { Router } from "express";
import { createInterview, updateInterview, getInterviewById, getAnswersByInterviewId } from "../db.js";

const router = Router();

// Create interview record
router.post("/interviews", (req, res) => {
  try {
    const data = req.body;
    if (!data.candidate_name || !data.role) {
      return res.status(400).json({ error: "Missing required fields: candidate_name, role" });
    }

    const interview = createInterview({
      candidate_name: data.candidate_name,
      candidate_email: data.candidate_email || null,
      role: data.role,
      mode: data.mode || "video",
      status: data.status || "uploading",
      total_questions: data.total_questions || 0,
      user_agent: data.user_agent || null,
      device_hint: data.device_hint || null,
      visibility_hidden_count: data.visibility_hidden_count || 0,
      practice_rerecords: data.practice_rerecords || 0,
      speed_ping_ms: data.speed_ping_ms ?? null,
      speed_download_mbps: data.speed_download_mbps ?? null,
      speed_upload_mbps: data.speed_upload_mbps ?? null,
      speed_rating: data.speed_rating || null,
    });

    res.status(201).json(interview);
  } catch (e) {
    console.error("Create interview error:", e);
    res.status(500).json({ error: e.message });
  }
});

// Update interview record
router.put("/interviews/:id", (req, res) => {
  try {
    const { id } = req.params;
    const existing = getInterviewById(id);
    if (!existing) {
      return res.status(404).json({ error: "Interview not found" });
    }

    const updated = updateInterview(id, req.body);
    res.json(updated);
  } catch (e) {
    console.error("Update interview error:", e);
    res.status(500).json({ error: e.message });
  }
});

// Get interview with answers
router.get("/interview/:id", (req, res) => {
  try {
    const { id } = req.params;
    const interview = getInterviewById(id);
    if (!interview) {
      return res.status(404).json({ error: "Interview not found" });
    }

    const answers = getAnswersByInterviewId(id);

    // Build file URLs
    const host = req.get("host");
    const proto = req.protocol;
    const base = `${proto}://${host}`;

    const answerLinks = answers.map((a) => ({
      ...a,
      file_url: `${base}/files/${a.storage_path}`,
    }));

    const practiceUrl = interview.practice_storage_path
      ? `${base}/files/${interview.practice_storage_path}`
      : null;

    res.json({
      ...interview,
      practice_url: practiceUrl,
      answers: answerLinks,
    });
  } catch (e) {
    console.error("Get interview error:", e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
