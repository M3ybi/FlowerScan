import type { Handler } from "@netlify/functions";
import { headers, isValidEmail, readSettings, writeSettings } from "./_shared/storage";

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { headers, statusCode: 204 };
  }

  if (event.httpMethod === "GET") {
    const settings = await readSettings();
    return { body: JSON.stringify({ recipient: settings.recipient }), headers, statusCode: 200 };
  }

  if (event.httpMethod !== "POST") {
    return { body: JSON.stringify({ error: "Method not allowed" }), headers, statusCode: 405 };
  }

  const body = JSON.parse(event.body || "{}") as { recipient?: string };
  const recipient = typeof body.recipient === "string" ? body.recipient.trim() : "";

  if (!isValidEmail(recipient)) {
    return { body: JSON.stringify({ error: "Neplatná emailová adresa." }), headers, statusCode: 400 };
  }

  const current = await readSettings();
  await writeSettings({ ...current, recipient });

  return { body: JSON.stringify({ recipient }), headers, statusCode: 200 };
};
