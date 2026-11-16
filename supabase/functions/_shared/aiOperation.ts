import { createServiceClient } from "./auth.ts";
import { ImageUploadError, imageErrorResponse, imageNetworkError, imageProviderFailure } from "./imageUpload.ts";
import { aiOperationMessage, type AiOperationCode } from "../../../src/lib/imageUploadErrors.ts";
import { json } from "./cors.ts";
import { getModelConfiguration, getLunaConfiguration, isLunaConfiguration, modelConfigurationHash, applyModelConfiguration, routeForKind, type ModelConfiguration } from "./aiModelRegistry.ts";
import { providerDiagnostics, providerHttpCategory, providerRequestId, type ProviderParseStatus, type ProviderFailureCategory } from "./aiProviderDiagnostics.ts";

type Kind = "initial_care" | "care_refresh" | "diagnosis" | "image_validation" | "upload_validation";
type JsonObject = Record<string, unknown>;
const tokenCount = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
type RpcResult = { data: unknown; error: { message?: string } | null };
type RpcCall = PromiseLike<RpcResult> & { abortSignal?: (signal: AbortSignal) => PromiseLike<RpcResult> };
type Rpc = { rpc: (name: string, args: JsonObject) => RpcCall };
type Image = { bytes: Uint8Array; width: number; height: number };
export type SafetyOperationContext = { actorId: string; householdId?: string; kind: "image_validation" | "upload_validation"; image: Image; retryKey?: unknown;
  imageDetail?: "high" | "low"; preprocessingProfile?: string; evaluationInputKey?: string; safetyConfiguration?: ModelConfiguration };
type Options<T extends JsonObject> = {
  actorId: string;
  householdId?: string;
  plantId?: string;
  kind: Kind;
  retryKey?: unknown;
  image: Image;
  promptVersion: string;
  imageDetail?: "high" | "low";
  preprocessingProfile?: string;
  evaluationInputKey?: string;
  promptEvaluation?: { runId: string; inputKey: string; definitionHash: string; contextHash: string };
  modelEvaluation?: { runId: string; inputKey: string; configurationId: string; configurationHash: string; contextHash: string };
  safetyConfiguration?: ModelConfiguration;
  payload: JsonObject;
  timeoutMs: number;
  parse: (payload: JsonObject) => T;
};

export class AiOperationError extends Error {
  constructor(public readonly status: number, public readonly code: AiOperationCode, message: string) { super(message); }
}

export const aiErrorResponse = (error: unknown, language?: unknown) => error instanceof AiOperationError
  ? json(error.status, { code: error.code, error: aiOperationMessage(error.code, language) })
  : imageErrorResponse(error instanceof ImageUploadError ? error : new ImageUploadError("IMAGE_SERVICE_UNAVAILABLE", 503), language);

const publicFailure = (message = "") => {
  if (/AI_EVALUATION_FORBIDDEN|AI_EVALUATION_CLOSED/.test(message)) return new ImageUploadError("HOUSEHOLD_ACCESS_DENIED", 403);
  if (/AI_EVALUATION_LIMIT/.test(message)) return new AiOperationError(429, "AI_BUSY", "Controlled evaluation limit reached.");
  if (/IMAGE_RATE_LIMITED/.test(message)) return new ImageUploadError("IMAGE_RATE_LIMITED", 429);
  if (/HOUSEHOLD_ACCESS_DENIED|AUTHENTICATION_REQUIRED/.test(message)) return new ImageUploadError("HOUSEHOLD_ACCESS_DENIED", 403);
  if (/AI_(CARE_LIMIT|DIAGNOSIS_LIMIT|PLANT_LIMIT)/.test(message)) return new AiOperationError(403, "AI_ALLOWANCE_UNAVAILABLE", "The household's current AI allowance is unavailable.");
  if (/AI_PENDING_PLANTS/.test(message)) return new AiOperationError(429, "AI_PENDING_PLANTS", "Save or resume an unfinished plant before generating another. Your completed result is retained for retry.");
  if (/AI_IDEMPOTENCY_CONFLICT|AI_INVALID_OPERATION/.test(message)) return new AiOperationError(400, "AI_INVALID_OPERATION", "This AI request is invalid. Please start it again.");
  if (/AI_BUSY|AI_RATE_LIMITED/.test(message)) return new AiOperationError(429, "AI_BUSY", "AI is busy. Please retry shortly; your form is preserved.");
  if (/AI_CIRCUIT_OPEN/.test(message)) return new AiOperationError(503, "AI_TEMPORARILY_UNAVAILABLE", "AI is temporarily paused. Please retry later; your household plan is unchanged.");
  return new ImageUploadError("IMAGE_SERVICE_UNAVAILABLE", 503);
};

const rpc = async (client: Rpc, name: string, args: JsonObject) => {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const pending = client.rpc(name, args);
    const request = pending.abortSignal ? pending.abortSignal(controller.signal) : pending;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("AI_DATABASE_TIMEOUT")); }, 10_000);
    });
    const { data, error } = await Promise.race([Promise.resolve(request), deadline]);
    if (error) throw publicFailure(error.message);
    return data;
  } catch (error) {
    throw error instanceof AiOperationError || error instanceof ImageUploadError ? error : new ImageUploadError("IMAGE_SERVICE_UNAVAILABLE", 503);
  } finally { clearTimeout(timer); }
};

export const resolveSafetyConfiguration = async (actorId: string, householdId?: string) => {
  const data = await rpc(createServiceClient(), "ai_resolve_safety_configuration", { actor: actorId, household: householdId ?? null }) as { id?: string; hash?: string } | null;
  const config = getModelConfiguration(data?.id);
  if (!config || config.route !== "image_safety" || await modelConfigurationHash(config) !== data?.hash) throw new ImageUploadError("IMAGE_SERVICE_UNAVAILABLE", 503);
  return config;
};

export const imageHash = async (bytes: Uint8Array) => Array.from(new Uint8Array(
  await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>)), byte => byte.toString(16).padStart(2, "0")).join("");

// The fingerprint uses a content hash in place of photo bytes. No prompts or
// photos enter SQL or logs. Object construction order is controlled by callers.
export const requestFingerprint = async (payload: JsonObject, imageSha256: string, version: string, day = "") => {
  const input = { ...payload };
  if (Array.isArray(payload.input)) input.input = payload.input.map(message => {
    if (!message || typeof message !== "object" || !Array.isArray(message.content)) return message;
    return { ...message, content: message.content.map((content: Record<string, unknown>) =>
      content.type === "input_image" ? { ...content, image_url: imageSha256 } : content) };
  });
  return imageHash(new TextEncoder().encode(JSON.stringify({ version, day, input })));
};

const readProviderJson = async (response: Response): Promise<JsonObject> => {
  if (!response.body) throw new Error("EMPTY_PROVIDER_RESPONSE");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 131072) { await reader.cancel(); throw new Error("PROVIDER_RESPONSE_TOO_LARGE"); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const payload: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("INVALID_PROVIDER_RESPONSE");
    return payload as JsonObject;
  } finally { reader.releaseLock(); }
};

export const runAiOperation = async <T extends JsonObject>(apiKey: string, options: Options<T>): Promise<T> => {
  const client = createServiceClient();
  const evaluationConfiguration = options.modelEvaluation ? getModelConfiguration(options.modelEvaluation.configurationId) : undefined;
  if (options.modelEvaluation && (!evaluationConfiguration || !isLunaConfiguration(evaluationConfiguration) || options.promptEvaluation || options.evaluationInputKey
    || await modelConfigurationHash(evaluationConfiguration) !== options.modelEvaluation.configurationHash)) throw publicFailure("AI_EVALUATION_FORBIDDEN");
  const defaultConfiguration = options.safetyConfiguration ?? getLunaConfiguration(routeForKind(options.kind));
  // Closed historical evaluators retain their pre-cutover contracts. The SQL
  // provider-start guard disables every legacy-model path at final cutover.
  const legacyEvaluation = options.promptEvaluation || options.evaluationInputKey;
  const model = evaluationConfiguration?.model ?? (legacyEvaluation ? "gpt-4o" : defaultConfiguration.model);
  // Explicit standard tier makes the versioned standard-price registry applicable.
  let payload: JsonObject = { ...options.payload, model, service_tier: "default", store: false };
  if (evaluationConfiguration) payload = applyModelConfiguration(payload, evaluationConfiguration);
  const detail = options.imageDetail ?? "high";
  if (Array.isArray(payload.input)) payload.input = payload.input.map(message => ({
    ...message, content: message.content.map((content: Record<string, unknown>) => content.type === "input_image" ? { ...content, detail } : content),
  }));
  const hash = await imageHash(options.image.bytes);
  // A registered campaign input remains the same operation across midnight.
  // Ordinary care refreshes retain the existing UTC-day product identity.
  const day = options.kind === "care_refresh" && !options.modelEvaluation ? new Date().toISOString().slice(0, 10) : "";
  // Preserve the historical logical identity of care/diagnosis. This marker is
  // never a provider choice: the database returns the immutable actual binding.
  // Changing a route, effort or OPENAI_MODEL must not charge a retry twice.
  const identityPayload = !options.modelEvaluation && !options.safetyConfiguration ? { ...payload, model: "gpt-4o" } : payload;
  const fingerprint = await requestFingerprint(identityPayload, hash, options.promptVersion, day);
  if (options.retryKey !== undefined && (typeof options.retryKey !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(options.retryKey))) {
    throw publicFailure("AI_INVALID_OPERATION");
  }
  const safetyNamespace = options.safetyConfiguration ? `:s:${await modelConfigurationHash(options.safetyConfiguration)}` : "";
  const clientKey = typeof options.retryKey === "string" && safetyNamespace ? await imageHash(new TextEncoder().encode(options.retryKey)) : options.retryKey;
  const retryKey = typeof clientKey === "string" ? `${clientKey}${day ? `:${day}` : ""}${safetyNamespace}` : `legacy:${fingerprint}`;
  if (retryKey.length > 160) throw publicFailure("AI_INVALID_OPERATION");
  const claim = await rpc(client, options.modelEvaluation ? "ai_claim_model_operation" : options.promptEvaluation ? "ai_claim_prompt_operation" : "ai_claim_image_operation", {
    actor: options.actorId, household: options.householdId || null, plant: options.plantId || null, kind: options.kind,
    retry_key: retryKey, request_fingerprint: fingerprint, image_sha256: hash,
    model_name: model, prompt_schema_version: options.promptVersion, output_limit: payload.max_output_tokens,
    image_width: options.image.width, image_height: options.image.height,
    image_detail: detail, preprocessing_profile: options.preprocessingProfile ?? "normalized-jpeg-v1",
    encoded_image_bytes: options.image.bytes.byteLength,
    ...(options.modelEvaluation ? {
      model_campaign: options.modelEvaluation.runId, model_input_key: options.modelEvaluation.inputKey,
      configuration_id: options.modelEvaluation.configurationId, configuration_hash: options.modelEvaluation.configurationHash, context_hash: options.modelEvaluation.contextHash,
    } : options.promptEvaluation ? {
      evaluation_run: options.promptEvaluation.runId, evaluation_input_key: options.promptEvaluation.inputKey,
      definition_hash: options.promptEvaluation.definitionHash, context_hash: options.promptEvaluation.contextHash,
    } : { evaluation_input_key: options.evaluationInputKey ?? null }),
  }) as { decision?: string; operationId?: string; leaseId?: string; result?: T; warning?: boolean; state?: string; effectiveConfiguration?: string; configurationHash?: string; stopCode?: string } | null;
  if (claim?.decision === "CAMPAIGN_STOP") throw publicFailure(claim.stopCode === "AI_CIRCUIT_OPEN" ? "AI_CIRCUIT_OPEN" : "AI_EVALUATION_LIMIT");
  if (claim?.decision === "REPLAY" && claim.result) return claim.result;
  if (claim?.decision === "WAIT") throw new AiOperationError(409, "AI_IN_PROGRESS", "This AI request is still processing. Retry shortly to retrieve its result.");
  if (claim?.decision === "STOP") throw new AiOperationError(503, "AI_RESULT_UNCERTAIN", "The previous AI attempt has no recoverable result. Please retry later; your form is preserved.");
  if (claim?.decision !== "RUN" || !claim.operationId || !claim.leaseId) throw new ImageUploadError("IMAGE_SERVICE_UNAVAILABLE", 503);
  let timeoutMs = options.timeoutMs;
  if (claim.effectiveConfiguration) {
    const selected = getModelConfiguration(claim.effectiveConfiguration);
    if (!selected || !["gpt-4o", "gpt-6-luna"].includes(selected.model) || await modelConfigurationHash(selected) !== claim.configurationHash || selected.promptVersion !== options.promptVersion
      || selected.outputLimit !== payload.max_output_tokens || selected.detail !== detail
      || (options.modelEvaluation ? selected.id !== evaluationConfiguration?.id : selected.route !== routeForKind(options.kind))) {
      throw new ImageUploadError("IMAGE_SERVICE_UNAVAILABLE", 503);
    }
    payload = applyModelConfiguration(payload, selected); timeoutMs = selected.timeoutMs;
  } else if (!legacyEvaluation) throw new ImageUploadError("IMAGE_SERVICE_UNAVAILABLE", 503);
  if (claim.warning) console.warn("plantie.ai_financial_warning", { code: "DAILY_AI_SPEND_WARNING" });
  const attemptId = await rpc(client, "ai_start_image_attempt", { operation: claim.operationId, lease: claim.leaseId });
  if (typeof attemptId !== "string") throw new ImageUploadError("IMAGE_SERVICE_UNAVAILABLE", 503);
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Provider deadline", "TimeoutError")), timeoutMs);
  let result: T | null = null;
  let failure: unknown;
  let outcome = "UNKNOWN";
  const facts: JsonObject = {};
  let providerBody: JsonObject | undefined;
  let responseAt: string | null = null;
  let parseStatus: ProviderParseStatus = "NOT_RECEIVED";
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Client-Request-Id": attemptId },
      body: JSON.stringify(payload), signal: controller.signal,
    });
    facts.httpStatus = response.status;
    facts.requestId = providerRequestId(response.headers.get("x-request-id"));
    responseAt = new Date().toISOString();
    if (!response.ok) facts.failureCategory = providerHttpCategory(response.status, null);
    const body = await readProviderJson(response);
    providerBody = body; parseStatus = "PARSED";
    facts.model = typeof body.model === "string" && /^gpt-(?:4o|6-luna|6\.1-terra)(?:-\d{4}-\d{2}-\d{2})?$/.test(body.model) ? body.model : null;
    facts.serviceTier = typeof body.service_tier === "string" && ["default", "flex", "priority", "scale"].includes(body.service_tier) ? body.service_tier : null;
    facts.responseId = typeof body.id === "string" && /^resp_[A-Za-z0-9_-]{1,180}$/.test(body.id) ? body.id : null;
    facts.providerStatus = typeof body.status === "string" && ["completed", "failed", "incomplete", "cancelled", "queued", "in_progress"].includes(body.status) ? body.status : null;
    // Whitelist token counts, never provider errors/input/output into cost facts.
    const usage = body.usage as { input_tokens?: unknown; output_tokens?: unknown; total_tokens?: unknown; input_tokens_details?: { cached_tokens?: unknown; cache_write_tokens?: unknown; cache_write_tokens_details?: { ttl_30m_tokens?: unknown; ttl_12h_tokens?: unknown } }; output_tokens_details?: { reasoning_tokens?: unknown } } | undefined;
    if (usage && typeof usage === "object") facts.usage = {
      input_tokens: tokenCount(usage.input_tokens), output_tokens: tokenCount(usage.output_tokens), total_tokens: tokenCount(usage.total_tokens),
      input_tokens_details: { cached_tokens: tokenCount(usage.input_tokens_details?.cached_tokens), cache_write_tokens: tokenCount(usage.input_tokens_details?.cache_write_tokens),
        ...(usage.input_tokens_details?.cache_write_tokens_details ? { cache_write_tokens_details: {
          ttl_30m_tokens: tokenCount(usage.input_tokens_details.cache_write_tokens_details.ttl_30m_tokens),
          ttl_12h_tokens: tokenCount(usage.input_tokens_details.cache_write_tokens_details.ttl_12h_tokens),
        } } : {}) },
      output_tokens_details: { reasoning_tokens: tokenCount(usage.output_tokens_details?.reasoning_tokens) },
    };
    const reasoning = body.reasoning as { effort?: unknown } | undefined;
    if (typeof reasoning?.effort === "string" && ["none", "low", "medium", "high", "xhigh", "max"].includes(reasoning.effort)) facts.reasoningEffort = reasoning.effort;
    outcome = "FAILED";
    if (!response.ok) {
      facts.failureCategory = providerHttpCategory(response.status, (body.error as { code?: unknown } | null)?.code);
      facts.providerDiagnostics = providerDiagnostics(body, facts.failureCategory as ProviderFailureCategory, responseAt, parseStatus);
      // Error bodies may contain arbitrary echoed text, including these fields.
      facts.model = typeof body.model === "string" && /^gpt-(?:4o|6-luna|6\.1-terra)(?:-\d{4}-\d{2}-\d{2})?$/.test(body.model) ? body.model : null;
      facts.serviceTier = typeof body.service_tier === "string" && ["default", "flex", "priority", "scale"].includes(body.service_tier) ? body.service_tier : null;
      facts.responseId = typeof body.id === "string" && /^resp_[A-Za-z0-9_-]{1,180}$/.test(body.id) ? body.id : null;
      facts.providerStatus = typeof body.status === "string" && ["completed", "failed", "incomplete", "cancelled", "queued", "in_progress"].includes(body.status) ? body.status : null;
      const code = (facts.providerDiagnostics as { code: string | null }).code;
      throw await imageProviderFailure(Response.json({ error: { code } }, { status: response.status }));
    }
    // A valid schema from an unregistered/wrong model is not an authorized
    // result. Settlement still records its usage or retains unknown exposure.
    const matchesModel = facts.model === payload.model || (payload.model === "gpt-4o" && facts.model === "gpt-4o-2024-08-06");
    if (!matchesModel || (payload.reasoning && typeof payload.reasoning === "object"
      && facts.reasoningEffort !== undefined && facts.reasoningEffort !== (payload.reasoning as JsonObject).effort)) {
      facts.failureCategory = "PROVIDER_RESULT_INVALID";
      throw new ImageUploadError("IMAGE_SERVICE_UNAVAILABLE", 503);
    }
    if (body.status === "incomplete" || body.status === "failed" || body.status === "cancelled") {
      facts.failureCategory = body.status === "incomplete" ? "PROVIDER_INCOMPLETE" : body.status === "cancelled" ? "PROVIDER_CANCELLED" : "PROVIDER_FAILED";
      throw new ImageUploadError("IMAGE_SERVICE_UNAVAILABLE", 503);
    }
    if (Array.isArray(body.output) && body.output.some(item => item && typeof item === "object" && Array.isArray(item.content)
      && item.content.some((part: Record<string, unknown> | null) => part?.type === "refusal"))) {
      facts.failureCategory = "PROVIDER_REFUSED";
      throw new ImageUploadError("IMAGE_SERVICE_UNAVAILABLE", 503);
    }
    result = options.parse(body);
    outcome = "COMPLETED";
  } catch (error) {
    failure = error instanceof ImageUploadError || error instanceof AiOperationError ? error : imageNetworkError(error);
    if (controller.signal.aborted || error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) facts.failureCategory = "PROVIDER_TIMEOUT";
    facts.failureCategory ??= responseAt && parseStatus !== "PARSED" ? "PROVIDER_RESULT_INVALID" : outcome === "UNKNOWN" ? "PROVIDER_TRANSPORT" : "PROVIDER_RESULT_INVALID";
    if (parseStatus !== "PARSED" && responseAt) parseStatus = error instanceof Error && error.message === "PROVIDER_RESPONSE_TOO_LARGE" ? "OVERSIZED"
      : controller.signal.aborted ? "INTERRUPTED" : "MALFORMED";
  } finally { clearTimeout(timer); }
  if (failure || !facts.usage) {
    facts.providerDiagnostics ??= providerDiagnostics(providerBody, (facts.failureCategory ?? "PROVIDER_MISSING_USAGE") as ProviderFailureCategory, responseAt, parseStatus);
    console.warn("plantie.ai_provider_failure", { attemptId, httpStatus: facts.httpStatus ?? null, requestId: facts.requestId ?? null, ...facts.providerDiagnostics as JsonObject });
  }
  facts.latencyMs = Math.max(0, Date.now() - started);
  // Repeating settlement is safe; repeating inference after uncertain transport is not.
  let settlement: { state?: string } | null = null;
  for (let retry = 0; retry < 2; retry++) {
    try {
      settlement = await rpc(client, "ai_finish_attempt", {
        operation: claim.operationId, lease: claim.leaseId, attempt: attemptId, outcome, final_result: result, facts,
      }) as { state?: string };
      break;
    } catch { if (retry === 1) throw new ImageUploadError("IMAGE_SERVICE_UNAVAILABLE", 503); }
  }
  if (failure) throw failure;
  if (settlement?.state !== "COMPLETED" || !result) throw new ImageUploadError("IMAGE_SERVICE_UNAVAILABLE", 503);
  return result;
};
