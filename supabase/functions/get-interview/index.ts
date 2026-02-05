// supabase/functions/get-interview/index.ts
// Returns interview metadata + signed URLs for clips (for a future HR review page).
// Requires service role key in env. Caller provides interview_id.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ReqBody = { interview_id: string };

function mustGetEnv(key: string): string {
  const v = Deno.env.get(key);
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
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

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const { data: interview, error: iErr } = await admin
      .from("interviews")
      .select("*")
      .eq("id", body.interview_id)
      .single();

    if (iErr) throw new Error(iErr.message);

    const { data: answers, error: aErr } = await admin
      .from("interview_answers")
      .select("*")
      .eq("interview_id", body.interview_id)
      .order("question_index", { ascending: true });

    if (aErr) throw new Error(aErr.message);

    const expiresIn = 60 * 60 * 24 * 7;
    const clips = [] as Array<any>;

    for (const ans of answers ?? []) {
      const { data: signed, error: sErr } = await admin.storage
        .from("interviews")
        .createSignedUrl(ans.storage_path, expiresIn);

      if (sErr) throw new Error(sErr.message);

      clips.push({
        question_index: ans.question_index,
        question_text: ans.question_text,
        followup_text: ans.followup_text,
        signed_url: signed.signedUrl,
        duration_seconds: ans.duration_seconds,
        mime_type: ans.mime_type,
      });
    }

    return new Response(JSON.stringify({ interview, clips }), {
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
