// Offline Auth service boundary; the application and useAuth hook remain real.
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

const user = { id: "11111111-1111-4111-8111-111111111111", email: "fixture@example.test",
  email_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: { provider: "email" }, user_metadata: {} };
const expiresAt = Math.floor(Date.now() / 1000) + 3600;
const token = [btoa("{}"), btoa(JSON.stringify({ sub: user.id, session_id: "22222222-2222-4222-8222-222222222222", exp: expiresAt })), "fixture"].join(".");
const signedInSession = { user, access_token: token, refresh_token: "fixture-only", expires_at: expiresAt } as Session;
const parameters = new URLSearchParams(location.search);
let session: Session | null = parameters.has("signed-in") ? signedInSession : null;
let held = parameters.has("hold-auth");
let release: () => void = () => {};
const ready = new Promise<void>(resolve => { release = resolve; });
const listeners = new Set<(event: AuthChangeEvent, session: Session | null) => void>();
const emit = (event: AuthChangeEvent) => { for (const listener of listeners) listener(event, session); };
const boundary = {
  release() { held = false; release(); },
  setAuthenticated(value: boolean) { session = value ? signedInSession : null; emit(value ? "SIGNED_IN" : "SIGNED_OUT"); },
};
Object.assign(window, { __entryFixtureAuth: boundary });
declare global { interface Window { __entryFixtureAuth: typeof boundary; } }

export const getCurrentSession = async () => { if (held) await ready; return session; };
export const getCurrentUser = async () => session?.user ?? null;
export const onAuthStateChange = (listener: (event: AuthChangeEvent, session: Session | null) => void) => {
  listeners.add(listener); return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
};
export const exchangeAuthCodeForSession = async (code: string) => {
  if (!code.startsWith("fixture-")) throw new Error("Unknown fixture callback");
  session = signedInSession; emit(location.pathname === "/auth/recovery" ? "PASSWORD_RECOVERY" : "SIGNED_IN");
};
export const bootstrapAuthenticatedAccount = async () => {};
export const nativeAuthLinkErrorEvent = "fixture-native-auth-error";
export const nativeAuthLinkSuccessEvent = "fixture-native-auth-success";
export const ensureNativeAuthListener = async () => {};
export const removeNativeAuthListener = async () => {};
export const getPasswordResetRetryAt = () => 0;
export const signOut = async () => boundary.setAuthenticated(false);
export const finishPasswordRecovery = signOut;
const unsupported = async () => { throw new Error("This offline fixture does not create accounts or send messages"); };
export const signInWithGoogle = unsupported;
export const registerWithEmailPassword = unsupported;
export const signInWithEmailPassword = unsupported;
export const requestPasswordReset = unsupported;
export const updatePassword = unsupported;
