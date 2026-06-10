export const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-revenuecat-webhook-secret",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json; charset=utf-8",
};

export const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { headers: corsHeaders, status });

