import { Router } from "express";
import { getInterviewById, getAnswersByInterviewId } from "../db.js";

const router = Router();

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

router.post("/send-email", async (req, res) => {
  try {
    const { interview_id } = req.body;
    if (!interview_id) {
      return res.status(400).json({ error: "Missing interview_id" });
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const FROM_EMAIL = process.env.FROM_EMAIL || "careers@azzurrohotels.com";
    const CAREERS_EMAIL = process.env.CAREERS_EMAIL || "careers@azzurrohotels.com";

    if (!RESEND_API_KEY || RESEND_API_KEY === "re_xxxxx") {
      console.warn("RESEND_API_KEY not configured — skipping email send");
      return res.json({ ok: true, skipped: true, reason: "RESEND_API_KEY not configured" });
    }

    const interview = getInterviewById(interview_id);
    if (!interview) {
      return res.status(404).json({ error: "Interview not found" });
    }

    const answers = getAnswersByInterviewId(interview_id);
    const host = req.get("host");
    const proto = req.protocol;
    const base = `${proto}://${host}`;

    const candidateName = escapeHtml(interview.candidate_name || "Candidate");
    const role = escapeHtml(interview.role || "");
    const createdAt = escapeHtml(String(interview.created_at || ""));
    const device = escapeHtml(interview.device_hint || "");
    const hiddenCount = Number(interview.visibility_hidden_count || 0);

    const speedPing = interview.speed_ping_ms != null ? `${interview.speed_ping_ms} ms` : "—";
    const speedDown = interview.speed_download_mbps != null ? `${interview.speed_download_mbps} Mbps` : "—";
    const speedUp = interview.speed_upload_mbps != null ? `${interview.speed_upload_mbps} Mbps` : "—";
    const speedRatingVal = escapeHtml(interview.speed_rating || "Not tested");

    const speedColor =
      speedRatingVal === "Excellent" ? "#16a34a"
      : speedRatingVal === "Good" ? "#1d8bff"
      : speedRatingVal === "Fair" ? "#92400e"
      : speedRatingVal === "Poor" ? "#b91c1c"
      : "#4b5b6a";

    const speedHtml = `
      <div style="margin-top:16px; font-weight:900; color:#0b1b2b;">Internet Speed Test</div>
      <div style="margin-top:8px; display:grid; grid-template-columns:repeat(3,1fr); gap:8px;">
        <div style="border:1px solid #e6eef5;border-radius:10px;padding:10px;text-align:center;background:#fff;">
          <div style="font-size:11px;font-weight:700;color:#4b5b6a;text-transform:uppercase;letter-spacing:.05em;">Ping</div>
          <div style="font-size:18px;font-weight:900;color:#0b1b2b;margin-top:4px;">${speedPing}</div>
        </div>
        <div style="border:1px solid #e6eef5;border-radius:10px;padding:10px;text-align:center;background:#fff;">
          <div style="font-size:11px;font-weight:700;color:#4b5b6a;text-transform:uppercase;letter-spacing:.05em;">Download</div>
          <div style="font-size:18px;font-weight:900;color:#0b1b2b;margin-top:4px;">${speedDown}</div>
        </div>
        <div style="border:1px solid #e6eef5;border-radius:10px;padding:10px;text-align:center;background:#fff;">
          <div style="font-size:11px;font-weight:700;color:#4b5b6a;text-transform:uppercase;letter-spacing:.05em;">Upload</div>
          <div style="font-size:18px;font-weight:900;color:#0b1b2b;margin-top:4px;">${speedUp}</div>
        </div>
      </div>
      <div style="margin-top:8px;padding:8px 12px;border-radius:8px;font-size:13px;font-weight:700;color:${speedColor};background:rgba(0,0,0,0.03);border:1px solid #e6eef5;">
        Connection quality: ${speedRatingVal}
      </div>
    `;

    const clipsHtml = answers
      .map((a) => {
        const q = escapeHtml(a.question_text);
        const fileUrl = `${base}/files/${a.storage_path}`;
        const fu = a.followup_text
          ? `<div style="margin-top:6px;color:#4b5b6a;"><strong>Follow-up:</strong> ${escapeHtml(a.followup_text)}</div>`
          : "";
        return `
          <div style="padding:12px 14px;border:1px solid #e6eef5;border-radius:12px;margin:10px 0;background:#ffffff;">
            <div style="font-weight:800;color:#0b1b2b;margin-bottom:6px;">Q${a.question_index}: ${q}</div>
            ${fu}
            <div style="margin-top:10px;">
              <a href="${fileUrl}" style="display:inline-block;padding:10px 12px;border-radius:10px;background:linear-gradient(135deg,#1d8bff,#2fd1c5);color:#fff;text-decoration:none;font-weight:900;">Play recording</a>
            </div>
          </div>
        `;
      })
      .join("");

    const subject = `Azzurro Interview Submission — ${interview.candidate_name} (${interview.role})`;

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; background:#f3f9ff; padding:24px;">
        <div style="max-width:760px; margin:0 auto; background:#ffffff; border:1px solid #e6eef5; border-radius:16px; overflow:hidden;">
          <div style="padding:18px 20px; background:linear-gradient(135deg, rgba(29,139,255,0.12), rgba(47,209,197,0.10)); border-bottom:1px solid #e6eef5;">
            <div style="font-weight:900; font-size:16px; color:#0b1b2b;">Azzurro Hotels • AI Interview Portal</div>
            <div style="color:#4b5b6a; margin-top:4px;">New interview submitted</div>
          </div>
          <div style="padding:18px 20px;">
            <div style="font-size:14px; color:#0b1b2b;">
              <div><strong>Candidate:</strong> ${candidateName}</div>
              <div><strong>Role:</strong> ${role}</div>
              <div><strong>Submitted:</strong> ${createdAt}</div>
              <div><strong>Device:</strong> ${device}</div>
              <div><strong>Tab switches:</strong> ${hiddenCount}</div>
            </div>
            ${speedHtml}
            <div style="margin-top:16px; font-weight:900; color:#0b1b2b;">Recordings (Skim View)</div>
            <div style="color:#4b5b6a; margin-top:4px;">Each question is a separate clip. Watching all clips in order acts as a Full Review.</div>
            ${clipsHtml}
          </div>
        </div>
      </div>
    `;

    const result = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [CAREERS_EMAIL],
        subject,
        html,
      }),
    });

    if (!result.ok) {
      const text = await result.text();
      console.error("Resend API error:", result.status, text);
      return res.json({ ok: true, skipped: true, reason: `Resend API error: ${result.status}` });
    }

    const data = await result.json();
    res.json({ ok: true, result: data });
  } catch (e) {
    console.error("Send email error:", e);
    res.json({ ok: true, skipped: true, reason: e.message });
  }
});

export default router;
