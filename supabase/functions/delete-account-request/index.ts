import { requireUser } from "../_shared/auth.ts";
import { corsHeaders, json } from "../_shared/cors.ts";

const normalizeContact = (value: unknown) => (typeof value === "string" ? value.trim().slice(0, 120) : "");

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders, status: 204 });
  if (request.method !== "POST") return json(405, { message: "Use POST to request account deletion review." });

  let payload: { contact?: unknown; userId?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json(400, { message: "Invalid request body." });
  }

  const auth = await requireUser(request.headers.get("authorization") ?? "");
  const contact = normalizeContact(payload.contact);
  const userId = auth?.user.id ?? normalizeContact(payload.userId);
  if (!contact && !userId) {
    return json(400, { message: "Account email or user ID is required." });
  }

  console.info("Account deletion review requested", {
    contactProvided: Boolean(contact),
    userIdPrefix: userId ? `${userId.slice(0, 8)}...` : null,
  });

  return json(202, {
    destructiveAction: false,
    message: "Deletion request received for manual review. No account or household data was deleted automatically.",
  });
});

