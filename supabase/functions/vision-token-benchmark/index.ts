import { requireUser } from "../_shared/auth.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });
  if (!await requireUser(request.headers.get("authorization") ?? "")) return json(401, { error: "Sign in required." });
  return json(410, { error: "This historical evaluation endpoint is retired." });
});
