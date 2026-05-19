import type { Handler } from "@netlify/functions";
import { headers } from "./_shared/storage";

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { headers, statusCode: 204 };
  }

  if (event.httpMethod !== "GET") {
    return { body: JSON.stringify({ error: "Method not allowed" }), headers, statusCode: 405 };
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY ?? "";

  if (!publicKey) {
    return { body: JSON.stringify({ error: "VAPID_PUBLIC_KEY is not configured." }), headers, statusCode: 503 };
  }

  return { body: JSON.stringify({ publicKey }), headers, statusCode: 200 };
};
