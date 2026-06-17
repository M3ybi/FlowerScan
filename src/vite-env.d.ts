/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_PROVIDER?: string;
  readonly VITE_DISABLE_SUPABASE_READS?: string;
  readonly VITE_DISABLE_SUPABASE_WRITES?: string;
  readonly VITE_ENABLE_NETLIFY_LEGACY_BACKEND?: string;
  readonly VITE_ENABLE_SUPABASE_WRITES?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_REVENUECAT_API_KEY_ANDROID?: string;
  readonly VITE_REVENUECAT_API_KEY_IOS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
