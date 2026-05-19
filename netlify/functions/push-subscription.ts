import type { Handler } from "@netlify/functions";
import {
  headers,
  readPushSubscriptions,
  sanitizePushSubscription,
  writePushSubscriptions,
} from "./_shared/storage";

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { headers, statusCode: 204 };
  }

  if (event.httpMethod !== "POST" && event.httpMethod !== "DELETE") {
    return { body: JSON.stringify({ error: "Method not allowed" }), headers, statusCode: 405 };
  }

  let body: { subscription?: unknown };
  try {
    body = JSON.parse(event.body || "{}") as { subscription?: unknown };
  } catch {
    return { body: JSON.stringify({ error: "Invalid JSON body." }), headers, statusCode: 400 };
  }

  const subscription = sanitizePushSubscription(body.subscription);
  if (!subscription) {
    return { body: JSON.stringify({ error: "Invalid push subscription." }), headers, statusCode: 400 };
  }

  const subscriptions = await readPushSubscriptions();

  if (event.httpMethod === "DELETE") {
    const nextSubscriptions = subscriptions.filter((item) => item.endpoint !== subscription.endpoint);
    await writePushSubscriptions(nextSubscriptions);
    return { body: JSON.stringify({ count: nextSubscriptions.length }), headers, statusCode: 200 };
  }

  await writePushSubscriptions([subscription, ...subscriptions.filter((item) => item.endpoint !== subscription.endpoint)]);
  return { body: JSON.stringify({ count: subscriptions.length + 1 }), headers, statusCode: 200 };
};
