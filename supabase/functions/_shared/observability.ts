import { corsHeaders } from "./cors.ts";

type Operation = "auth_email" | "image_validation" | "image_upload" | "plant_care" | "plant_diagnosis" | "invitation_email" | "operator_email" | "deletion_review" | "subscription_webhook";
type Event = { event: "plantie.operation"; operation: Operation; requestId: string; status: number; durationMs: number; outcome: "success" | "denied" | "throttled" | "failed" };

// Correlation is per invocation. URLs, headers, accounts, bodies and exception
// messages never enter this record. This does not log provider payloads.
export const observeOperation = (operation: Operation, handler: (request: Request) => Promise<Response>, dependencies: {
  id?: () => string; now?: () => number; emit?: (event: Event) => void;
} = {}) => async (request: Request): Promise<Response> => {
  const requestId = (dependencies.id ?? (() => crypto.randomUUID()))();
  const now = dependencies.now ?? Date.now;
  const started = now();
  let response: Response;
  try { response = await handler(request); }
  catch {
    const message = "The operation is temporarily unavailable. Please retry.";
    response = new Response(JSON.stringify(operation === "auth_email" ? { error: { http_code: 503, message } }
      : { code: "SERVICE_UNAVAILABLE", error: message }), { status: 503, headers: corsHeaders });
  }
  const event: Event = { event: "plantie.operation", operation, requestId, status: response.status,
    durationMs: Math.max(0, Math.round(now() - started)), outcome: response.status === 429 ? "throttled"
      : response.status === 401 || response.status === 403 ? "denied" : response.status >= 400 ? "failed" : "success" };
  try { (dependencies.emit ?? (entry => console.info("plantie.operation", entry)))(event); }
  catch { /* Logging availability must not change a completed data operation. */ }
  const headers = new Headers(response.headers);
  headers.set("X-Plantie-Request-ID", requestId);
  const exposed = headers.get("Access-Control-Expose-Headers");
  headers.set("Access-Control-Expose-Headers", [exposed, "X-Plantie-Request-ID"].filter(Boolean).join(", "));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};
