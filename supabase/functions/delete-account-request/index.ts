import { observeOperation } from "../_shared/observability.ts";
import { requireUser } from "../_shared/auth.ts";
import { submitAccountDeletionReview } from "../_shared/accountDeletion.ts";
import { corsHeaders, json } from "../_shared/cors.ts";

Deno.serve(observeOperation("deletion_review", async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders, status: 204 });
  if (request.method !== "POST") return json(405, { message: "Use POST to request account deletion review." });
  try {
    const auth = await requireUser(request.headers.get("authorization") ?? "");
    if (!auth) return json(401, { message: "Sign in to verify your identity before requesting deletion review." });
    // The JWT determines the account. Caller-supplied contacts and IDs are ignored.
    const result = await submitAccountDeletionReview(auth.client);
    return json(result.status, result.body);
  } catch {
    return json(503, { message: "Deletion review could not be submitted. Please retry." });
  }
}));
