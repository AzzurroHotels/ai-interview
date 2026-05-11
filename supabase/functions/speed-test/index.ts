// supabase/functions/speed-test/index.ts
// Lightweight endpoint for client-side upload bandwidth measurement.
// The client sends a 4 MB payload; we simply consume it and return 200.
// Actual bandwidth is calculated on the client using timing.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (req.method === "POST") {
    try {
      // Read the entire body so the client can measure upload time accurately
      const body = await req.arrayBuffer();
      return new Response(null, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    } catch {
      return new Response(null, { status: 500, headers: corsHeaders });
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
