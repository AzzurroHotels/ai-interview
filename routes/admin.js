import { Router } from "express";
import crypto from "crypto";
import { getAnswersByInterviewId, getInterviewById, listInterviews } from "../db.js";

const router = Router();
const COOKIE_NAME = "azzurro_admin";
const SESSION_HOURS = 12;

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || "";
}

function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || getAdminPassword();
}

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload) {
  return crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

function makeSessionCookie() {
  const expiresAt = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  const payload = b64url(JSON.stringify({ role: "admin", expiresAt }));
  return `${payload}.${sign(payload)}`;
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const idx = part.indexOf("=");
        return idx === -1 ? [part, ""] : [part.slice(0, idx), decodeURIComponent(part.slice(idx + 1))];
      })
  );
}

function isValidSession(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token || !token.includes(".")) return false;

  const [payload, signature] = token.split(".");
  const expected = sign(payload);
  const left = Buffer.from(signature || "");
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.role === "admin" && Number(data.expiresAt) > Date.now();
  } catch {
    return false;
  }
}

function requireAdmin(req, res, next) {
  if (!isValidSession(req)) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

function publicInterview(interview, req) {
  const host = req.get("host");
  const proto = req.protocol;
  const base = `${proto}://${host}`;
  return {
    ...interview,
    practice_url: interview.practice_storage_path ? `${base}/files/${interview.practice_storage_path}` : null,
  };
}

router.get("/session", (req, res) => {
  res.json({ authenticated: isValidSession(req), configured: Boolean(getAdminPassword()) });
});

router.post("/login", (req, res) => {
  const adminPassword = getAdminPassword();
  if (!adminPassword) {
    return res.status(503).json({ error: "Admin password is not configured" });
  }

  const supplied = String(req.body?.password || "");
  const left = Buffer.from(supplied);
  const right = Buffer.from(adminPassword);
  const matches = left.length === right.length && crypto.timingSafeEqual(left, right);
  if (!matches) {
    return res.status(401).json({ error: "Invalid password" });
  }

  const maxAge = SESSION_HOURS * 60 * 60;
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(makeSessionCookie())}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}; Secure`
  );
  res.json({ ok: true });
});

router.post("/logout", (req, res) => {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Secure`);
  res.json({ ok: true });
});

router.get("/submissions", requireAdmin, (req, res) => {
  const submissions = listInterviews({
    limit: req.query.limit,
    offset: req.query.offset,
    query: req.query.q,
  }).map((row) => publicInterview(row, req));
  res.json({ submissions });
});

router.get("/submissions/:id", requireAdmin, (req, res) => {
  const interview = getInterviewById(req.params.id);
  if (!interview) {
    return res.status(404).json({ error: "Submission not found" });
  }

  const host = req.get("host");
  const proto = req.protocol;
  const base = `${proto}://${host}`;
  const answers = getAnswersByInterviewId(req.params.id).map((answer) => ({
    ...answer,
    file_url: `${base}/files/${answer.storage_path}`,
  }));

  res.json({ submission: { ...publicInterview(interview, req), answers } });
});

export default router;
