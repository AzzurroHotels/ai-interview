// supabase/functions/send-interview-email/index.ts
// Sends an email to careers@azzurrohotels.com with signed links to each clip.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ReqBody = {
  interview_id: string;
  to_email?: string;
};

function mustGetEnv(key: string): string {
  const v = Deno.env.get(key);
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

async function sendResendEmail(opts: { apiKey: string; from: string; to: string; subject: string; html: string }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Resend API error: ${res.status} ${t}`);
  }
  return await res.json();
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as ReqBody;
    if (!body?.interview_id) {
      return new Response(JSON.stringify({ error: "Missing interview_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = mustGetEnv("SUPABASE_URL");
    const SERVICE_KEY = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
    const RESEND_API_KEY = mustGetEnv("RESEND_API_KEY");
    const FROM_EMAIL = mustGetEnv("FROM_EMAIL");

    const toEmail = body.to_email || "careers@azzurrohotels.com";

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const { data: interview, error: iErr } = await admin
      .from("interviews")
      .select("*")
      .eq("id", body.interview_id)
      .single();

    if (iErr || !interview) throw new Error(iErr?.message || "Interview not found");

    const { data: answers, error: aErr } = await admin
      .from("interview_answers")
      .select("*")
      .eq("interview_id", body.interview_id)
      .order("question_index", { ascending: true });

    if (aErr) throw new Error(aErr.message);

    // Signed URLs (expire in 7 days)
    const expiresIn = 60 * 60 * 24 * 7;

    const signedLinks: Array<{ label: string; url: string; q: string; followup?: string }> = [];

    for (const ans of answers ?? []) {
      const { data: signed, error: sErr } = await admin.storage
        .from("interviews")
        .createSignedUrl(ans.storage_path, expiresIn);

      if (sErr) throw new Error(sErr.message);

      signedLinks.push({
        label: `Q${ans.question_index}`,
        url: signed.signedUrl,
        q: ans.question_text,
        followup: ans.followup_text || undefined,
      });
    }

    const candidateName = escapeHtml(interview.candidate_name || "Candidate");
    const role = escapeHtml(interview.role || "");
    const createdAt = escapeHtml(String(interview.created_at || ""));
    const device = escapeHtml(interview.device_hint || "");
    const hiddenCount = Number(interview.visibility_hidden_count || 0);

    const clipsHtml = signedLinks
      .map((l) => {
        const q = escapeHtml(l.q);
        const fu = l.followup ? `<div style="margin-top:6px;color:#4b5b6a;"><strong>Follow-up:</strong> ${escapeHtml(l.followup)}</div>` : "";
        return `
          <div style="padding:12px 14px;border:1px solid #e6eef5;border-radius:12px;margin:10px 0;background:#ffffff;">
            <div style="font-weight:800;color:#0b1b2b;margin-bottom:6px;">${l.label}: ${q}</div>
            ${fu}
            <div style="margin-top:10px;">
              <a href="${l.url}" style="display:inline-block;padding:10px 12px;border-radius:10px;background:linear-gradient(135deg,#1d8bff,#2fd1c5);color:#fff;text-decoration:none;font-weight:900;">Play recording</a>
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

            <div style="margin-top:16px; font-weight:900; color:#0b1b2b;">Recordings (Skim View)</div>
            <div style="color:#4b5b6a; margin-top:4px;">Each question is a separate clip. Watching all clips in order acts as a Full Review.</div>

            ${clipsHtml}

            <div style="margin-top:14px; color:#4b5b6a; font-size:12px;">
              Links expire in 7 days. If expired, re-send by calling the Edge Function again or increase expiry in code.
            </div>
          </div>
        </div>
      </div>
    `;

    const result = await sendResendEmail({
      apiKey: RESEND_API_KEY,
      from: FROM_EMAIL,
      to: toEmail,
      subject,
      html,
    });

    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
