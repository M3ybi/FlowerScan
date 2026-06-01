import type { Handler } from "@netlify/functions";

const hasValue = (value: string | undefined) => Boolean(value && value.trim());

export const handler: Handler = async () => {
  const checks = {
    aiBackendConfigured: hasValue(process.env.OPENAI_API_KEY),
    entitlementWebhookConfigured: hasValue(process.env.REVENUECAT_WEBHOOK_SECRET),
    storageBackendConfigured: hasValue(process.env.SUPABASE_URL) && hasValue(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };

  return {
    body: JSON.stringify({
      checks,
      ok: checks.storageBackendConfigured,
      service: "plantie",
      timestamp: new Date().toISOString(),
    }),
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
    statusCode: 200,
  };
};
