// Provider messages may quote request data. Retain finite identifiers only.
export const providerErrorCodes = Object.freeze([
  "invalid_request_error", "invalid_request", "invalid_value", "invalid_type", "missing_required_parameter",
  "unsupported_parameter", "unsupported_value", "unsupported_model", "model_not_found", "context_length_exceeded",
  "invalid_image", "invalid_image_format", "invalid_image_url", "invalid_base64_image", "image_parse_error", "image_too_large",
  "invalid_api_key", "permission_denied", "insufficient_quota", "rate_limit_exceeded", "billing_hard_limit_reached",
  "server_error", "service_unavailable", "slow_down", "server_is_overloaded", "content_policy_violation",
] as const);
export const providerErrorTypes = Object.freeze([
  "invalid_request_error", "authentication_error", "permission_error", "rate_limit_error", "server_error", "api_error", "insufficient_quota",
] as const);
export const providerErrorParams = Object.freeze([
  "model", "reasoning", "reasoning.effort", "reasoning.mode", "prompt_cache_options", "prompt_cache_options.ttl", "prompt_cache_options.mode",
  "text", "text.format", "text.format.schema", "text.format.name", "text.format.strict", "max_output_tokens", "service_tier", "store", "input",
  "input[].content[].image_url", "input[].content[].detail", "input[].content[].type", "input[].content[].text",
] as const);
export const providerFailureCategories = Object.freeze([
  "PROVIDER_INVALID_REQUEST", "PROVIDER_UNSUPPORTED_CONFIGURATION", "PROVIDER_AUTHENTICATION", "PROVIDER_PERMISSION",
  "PROVIDER_RATE_LIMIT", "PROVIDER_INTERNAL", "PROVIDER_HTTP_ERROR", "PROVIDER_TIMEOUT", "PROVIDER_TRANSPORT",
  "PROVIDER_RESULT_INVALID", "PROVIDER_MISSING_USAGE", "PROVIDER_INCOMPLETE", "PROVIDER_CANCELLED", "PROVIDER_FAILED", "PROVIDER_REFUSED",
] as const);
export type ProviderFailureCategory = typeof providerFailureCategories[number];
export type ProviderParseStatus = "NOT_RECEIVED" | "PARSED" | "MALFORMED" | "OVERSIZED" | "INTERRUPTED";
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const allowed = (value: unknown, values: readonly string[]) => value === undefined || value === null ? null
  : typeof value === "string" && value.length <= 128 && values.includes(value) ? value : "OTHER";
export const providerRequestId = (value: unknown) => typeof value === "string" && /^req_[A-Za-z0-9_-]{1,128}$/.test(value) ? value : null;
const parameter = (value: unknown) => {
  if (typeof value !== "string" || value.length > 128) return allowed(value, providerErrorParams);
  const indexed = /^input(?:\[\d{1,2}\]|\.\d{1,2})\.content(?:\[\d{1,2}\]|\.\d{1,2})\.(image_url|detail|type|text)$/.exec(value);
  return allowed(indexed ? `input[].content[].${indexed[1]}` : value, providerErrorParams);
};
export const providerHttpCategory = (status: number, code: unknown): ProviderFailureCategory => status === 401 ? "PROVIDER_AUTHENTICATION"
  : status === 403 ? "PROVIDER_PERMISSION" : status === 429 ? "PROVIDER_RATE_LIMIT" : status >= 500 ? "PROVIDER_INTERNAL"
  : ["unsupported_parameter", "unsupported_value", "unsupported_model", "model_not_found"].includes(typeof code === "string" ? code : "") ? "PROVIDER_UNSUPPORTED_CONFIGURATION"
  : status === 400 ? "PROVIDER_INVALID_REQUEST" : "PROVIDER_HTTP_ERROR";
export const providerDiagnostics = (body: unknown, category: ProviderFailureCategory, responseAt: string | null, parseStatus: ProviderParseStatus) => {
  const object = record(body), error = record(object.error);
  return { version: "provider-errors-v1", category, code: allowed(error.code, providerErrorCodes), type: allowed(error.type, providerErrorTypes),
    param: parameter(error.param), responseAt, parseStatus, usageState: object.usage && typeof object.usage === "object" && !Array.isArray(object.usage) ? "REPORTED" : "MISSING" };
};
