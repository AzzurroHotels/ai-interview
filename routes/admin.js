import { Router } from "express";
import crypto from "crypto";
import {
  listInterviews,
  getInterviewCounts,
  getInterviewById,
  getAnswersByInterviewId,
  markStaleInterviewsAbandoned,
} from "../db.js";

const router = Router();

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || crypto.randomBytes(16).toString("hex");
const ADMIN_TOKEN_GENERATED = !process.env.ADMIN_TOKEN;

export function getAdminTokenInfo() {
  return { token: ADMIN_TOKEN, generated: ADMIN_TOKEN_GENERATED };
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function requireAdmin(req, res, next) {
  const token = req.get("x-admin-token") || req.query.token;
  if (!token || !safeEqual(token, ADMIN_TOKEN)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

router.get("/admin/interviews", requireAdmin, (req, res) => {
  try {
    markStaleInterviewsAbandoned(Number(process.env.ABANDON_AFTER_MINUTES) || 3);

    const slug = req.query.slug ? String(req.query.slug) : null;
    const interviews = listInterviews(slug);
    const counts = getInterviewCounts();

    res.json({ interviews, counts });
  } catch (e) {
    console.error("Admin list error:", e);
    res.status(500).json({ error: e.message });
  }
});

router.get("/admin/interviews/:id", requireAdmin, (req, res) => {
  try {
    const interview = getInterviewById(req.params.id);
    if (!interview) return res.status(404).json({ error: "Interview not found" });

    const answers = getAnswersByInterviewId(interview.id);

    const host = req.get("host");
    const base = `${req.protocol}://${host}`;

    res.json({
      ...interview,
      practice_url: interview.practice_storage_path
        ? `${base}/files/${interview.practice_storage_path}`
        : null,
      answers: answers.map((a) => ({ ...a, file_url: `${base}/files/${a.storage_path}` })),
    });
  } catch (e) {
    console.error("Admin detail error:", e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
