/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_REVENUECAT_API_KEY_ANDROID?: string;
  readonly VITE_REVENUECAT_API_KEY_IOS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
