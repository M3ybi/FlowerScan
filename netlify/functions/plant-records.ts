import type { Handler } from "@netlify/functions";
import { headers, readRecords, sanitizeRecords, writeRecords } from "./_shared/storage";

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { headers, statusCode: 204 };
  }

  if (event.httpMethod === "GET") {
    const records = await readRecords();
    return { body: JSON.stringify({ records }), headers, statusCode: 200 };
  }

  if (event.httpMethod !== "POST") {
    return { body: JSON.stringify({ error: "Method not allowed" }), headers, statusCode: 405 };
  }

  const body = JSON.parse(event.body || "{}") as { records?: unknown };
  const records = sanitizeRecords(body.records);
  await writeRecords(records);

  return { body: JSON.stringify({ records }), headers, statusCode: 200 };
};
