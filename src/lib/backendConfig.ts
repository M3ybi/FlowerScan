import { imageErrorFromResponse } from "./imageUploadErrors.js";
import { supabase } from "./supabase.js";

export type BackendProvider = "supabase" | "netlify";

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;

const normalizeProvider = (value: string | undefined): BackendProvider =>
  value?.toLowerCase() === "netlify" ? "netlify" : "supabase";

export const backendProvider = normalizeProvider(env?.VITE_BACKEND_PROVIDER);

export const isSupabaseBackend = backendProvider === "supabase";

export const isLegacyNetlifyBackendEnabled =
  backendProvider === "netlify" || env?.VITE_ENABLE_NETLIFY_LEGACY_BACKEND === "true";

export type BackendFunctionOptions = {
  allowNetlifyFallback?: boolean;
  body?: Record<string, unknown>;
  functionName: string;
  netlifyPath: string;
};

export const resolveBackendProvider = (
  provider = backendProvider,
  legacyNetlifyEnabled = env?.VITE_ENABLE_NETLIFY_LEGACY_BACKEND === "true",
) => ({
  isLegacyNetlifyBackendEnabled: provider === "netlify" || legacyNetlifyEnabled,
  isSupabaseBackend: provider === "supabase",
  provider,
});

const extractResponseErrorMessage = async (response: Response) => {
  try {
    const payload = (await response.clone().json()) as { error?: unknown; message?: unknown };
    const message = typeof payload.error === "string" ? payload.error : typeof payload.message === "string" ? payload.message : "";
    return message.trim();
  } catch {
    return "";
  }
};

const extractSupabaseFunctionErrorMessage = async (error: unknown) => {
  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    const message = await extractResponseErrorMessage(context);
    if (message) {
      return message;
    }
  }

  return error instanceof Error ? error.message : "";
};

export const callBackendFunction = async <T>({
  allowNetlifyFallback = false,
  body,
  functionName,
  netlifyPath,
}: BackendFunctionOptions): Promise<T> => {
  const imageWorkflow = ["upload-validated-image", "validate-plant-image", "plant-care-ai", "plant-diagnosis-ai"].includes(functionName);
  if (isSupabaseBackend) {
    if (!supabase) {
      if (!allowNetlifyFallback || !isLegacyNetlifyBackendEnabled) {
        throw new Error("Supabase backend is not configured.");
      }
    } else {
      const { data, error } = await supabase.functions.invoke(functionName, { body, ...(imageWorkflow ? { signal: AbortSignal.timeout(60_000) } : {}) }).catch(async (error: unknown) => {
        throw (imageWorkflow ? await imageErrorFromResponse(error) : null) ?? error;
      });
      if (!error) {
        return data as T;
      }

      if (!allowNetlifyFallback || !isLegacyNetlifyBackendEnabled) {
        throw (imageWorkflow ? await imageErrorFromResponse(error) : null) ?? new Error((await extractSupabaseFunctionErrorMessage(error)) || "Supabase backend request failed.");
      }
    }
  }

  if (!isLegacyNetlifyBackendEnabled) {
    throw new Error("Legacy Netlify backend is disabled.");
  }

  const response = await fetch(netlifyPath, {
    body: JSON.stringify(body ?? {}),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    ...(imageWorkflow ? { signal: AbortSignal.timeout(60_000) } : {}),
  }).catch(async (error: unknown) => { throw (imageWorkflow ? await imageErrorFromResponse(error) : null) ?? error; });

  if (!response.ok) {
    throw (imageWorkflow ? await imageErrorFromResponse({ context: response }) : null) ?? new Error((await extractResponseErrorMessage(response)) || `Legacy Netlify backend request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
};
