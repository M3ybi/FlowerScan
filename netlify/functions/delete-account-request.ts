import type { Handler } from "@netlify/functions";

const json = (statusCode: number, body: Record<string, unknown>) => ({
  body: JSON.stringify(body),
  headers: {
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  },
  statusCode,
});

const normalizeContact = (value: unknown) => (typeof value === "string" ? value.trim().slice(0, 120) : "");

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { message: "Use POST to request account deletion review." });
  }

  let payload: { contact?: unknown; userId?: unknown };
  try {
    payload = JSON.parse(event.body || "{}") as { contact?: unknown; userId?: unknown };
  } catch {
    return json(400, { message: "Invalid request body." });
  }

  const contact = normalizeContact(payload.contact);
  const userId = normalizeContact(payload.userId);
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
};
