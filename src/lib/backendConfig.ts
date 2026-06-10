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

export const callBackendFunction = async <T>({
  allowNetlifyFallback = false,
  body,
  functionName,
  netlifyPath,
}: BackendFunctionOptions): Promise<T> => {
  if (isSupabaseBackend) {
    if (!supabase) {
      if (!allowNetlifyFallback || !isLegacyNetlifyBackendEnabled) {
        throw new Error("Supabase backend is not configured.");
      }
    } else {
      const { data, error } = await supabase.functions.invoke(functionName, { body });
      if (!error) {
        return data as T;
      }

      if (!allowNetlifyFallback || !isLegacyNetlifyBackendEnabled) {
        throw new Error(error.message || "Supabase backend request failed.");
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
  });

  if (!response.ok) {
    throw new Error(`Legacy Netlify backend request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
};
