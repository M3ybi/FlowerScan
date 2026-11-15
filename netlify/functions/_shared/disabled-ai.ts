import type { Handler } from "@netlify/functions";

// Legacy inference cannot bypass the authoritative Supabase operation ledger,
// even if the unrelated legacy data-recovery backend is enabled by an operator.
export const disabledAiHandler: Handler = async (event) => ({
  statusCode: event.httpMethod === "OPTIONS" ? 204 : 410,
  headers: {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json; charset=utf-8",
  },
  ...(event.httpMethod === "OPTIONS" ? {} : { body: JSON.stringify({ error: "Legacy household access is disabled. Sign in to Plantie to access your household." }) }),
});
