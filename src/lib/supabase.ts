import { createClient } from "@supabase/supabase-js";

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const supabaseUrl = env?.VITE_SUPABASE_URL;
const supabaseAnonKey = env?.VITE_SUPABASE_ANON_KEY;

const createSupabaseBrowserClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      flowType: "pkce",
      // The auth hook exchanges callback codes after its listener is installed,
      // so PASSWORD_RECOVERY cannot be missed during client initialization.
      detectSessionInUrl: false,
    },
  });
};

export const supabase = createSupabaseBrowserClient();
export const isSupabaseConfigured = supabase !== null;
