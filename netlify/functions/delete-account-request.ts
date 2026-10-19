import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { submitAccountDeletionReview } from "../../supabase/functions/_shared/accountDeletion.js";
import { withRequestTimeout } from "../../src/lib/requestTimeout.js";

const json = (statusCode: number, body: Record<string, unknown>) => ({
  body: JSON.stringify(body), headers: { "Cache-Control": "no-store", "Content-Type": "application/json" }, statusCode,
});

// Compatibility endpoint uses the same authenticated database queue as Edge.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { message: "Use POST to request account deletion review." });
  const authorization = event.headers?.authorization ?? event.headers?.Authorization ?? "";
  if (!authorization.startsWith("Bearer ")) return json(401, { message: "Sign in to verify your identity before requesting deletion review." });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return json(503, { message: "Deletion review could not be submitted. Please retry." });
  try {
    return await withRequestTimeout(async (signal) => {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization }, fetch: (input, init) => fetch(input, { ...init, signal }) },
    });
    const { data, error } = await client.auth.getUser(authorization.slice(7));
    if (error || !data.user) return json(401, { message: "Sign in to verify your identity before requesting deletion review." });
    const result = await submitAccountDeletionReview(client);
    return json(result.status, result.body);
    }, 15_000);
  } catch {
    return json(503, { message: "Deletion review could not be submitted. Please retry." });
  }
};
