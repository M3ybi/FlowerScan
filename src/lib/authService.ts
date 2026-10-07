import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { getUserHouseholds } from "./plantieRepository";
import { supabase } from "./supabase";
import { createAuthActions, mapSupabaseAuthError, requireWebAuthRedirectUrl } from "./authRules";
import { authReturnInvitationStorageKey, authReturnPathStorageKey, createAuthReturnLocation, createSingleFlightAuthCodeExchange, safeAuthReturnLocation } from "./authRedirects";
import type { AuthRedirectPurpose } from "./authRedirects";
import { invitationReturnLocation, readInvitationAuthContext } from "./invitationAuthContext";
import {
  createNativeAuthCallbackHandler,
  nativeConfirmationRedirectUrl,
  nativeOAuthErrorEvent,
  nativeOAuthRedirectUrl,
  nativeOAuthSuccessEvent,
  nativeRecoveryRedirectUrl,
} from "./nativeOAuth";
import type { AuthActionsClient, AuthMode } from "./authRules";

export type { AuthMode };
export {
  createAuthActions,
  minimumAuthPasswordLength,
  validateAuthEmail,
  validateAuthPassword,
  validateLoginInput,
  validatePasswordResetInput,
  validatePasswordUpdateInput,
  validateRegistrationInput,
} from "./authRules";

export type AuthStateChangeCallback = (event: AuthChangeEvent, session: Session | null) => void;

const getClient = () => {
  if (!supabase) {
    throw new Error("Supabase Auth is not configured.");
  }

  return supabase;
};

const getRedirectUrl = (purpose: AuthRedirectPurpose = "callback") => {
  if (Capacitor.isNativePlatform()) {
    return purpose === "recovery" ? nativeRecoveryRedirectUrl
      : purpose === "confirmation" ? nativeConfirmationRedirectUrl
      : nativeOAuthRedirectUrl;
  }
  if (typeof window === "undefined") {
    return undefined;
  }

  const redirect = requireWebAuthRedirectUrl(window.location.href, purpose);
  if (purpose === "recovery") return redirect;
  try {
    const invitationId = readInvitationAuthContext(window.localStorage);
    if (invitationId) {
      const url = new URL(redirect);
      // An ID can only be resolved by its verified recipient; raw invite tokens stay out of auth redirects.
      url.searchParams.set("invitation", invitationId);
      return url.href;
    }
  } catch { /* Authentication still works when storage is unavailable. */ }
  return redirect;
};

const rememberPostAuthRoute = () => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(authReturnPathStorageKey, createAuthReturnLocation(window.location.href));
    const invitationId = readInvitationAuthContext(window.localStorage);
    if (invitationId) window.sessionStorage.setItem(authReturnInvitationStorageKey, invitationId);
    else window.sessionStorage.removeItem(authReturnInvitationStorageKey);
  } catch {
    // Authentication still works when the browser denies sessionStorage.
  }
};

const profileDisplayName = (user: User) => {
  const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name;
  if (typeof metadataName === "string" && metadataName.trim()) {
    return metadataName.trim().slice(0, 120);
  }

  return user.email?.split("@")[0]?.slice(0, 120) ?? null;
};

const authActions = createAuthActions({
  getClient: () => getClient() as AuthActionsClient,
  getRedirectUrl,
});

let nativeOAuthListener: Promise<void> | null = null;
let nativeListenerHandle: { remove(): Promise<void> } | null = null;
let nativeListenerActive = false;
let nativeListenerGeneration = 0;
let nativeOAuthInProgress = false;
let nativeBrowserFinishedListener: { remove(): Promise<void> } | null = null;
export const nativeAuthLinkErrorEvent = "planti-native-auth-link-error";

const clearNativeBrowserFinishedListener = async () => {
  const listener = nativeBrowserFinishedListener;
  nativeBrowserFinishedListener = null;
  await listener?.remove().catch(() => undefined);
};

const nativeCallbackHandler = createNativeAuthCallbackHandler(async (code) => {
  const { error } = await getClient().auth.exchangeCodeForSession(code);
  return { error };
});

const emitNativeOAuthError = (error: unknown) => {
  const message = error instanceof Error ? error.message : "Google sign-in could not be completed.";
  window.dispatchEvent(new CustomEvent(nativeOAuthErrorEvent, { detail: message }));
};

const restorePostAuthRoute = () => {
  try {
    const savedPath = window.sessionStorage.getItem(authReturnPathStorageKey);
    window.sessionStorage.removeItem(authReturnPathStorageKey);
    window.sessionStorage.removeItem(authReturnInvitationStorageKey);
    const invitationId = readInvitationAuthContext(window.localStorage);
    if (savedPath || invitationId) {
      window.history.replaceState(window.history.state, "", savedPath ? safeAuthReturnLocation(savedPath) : invitationReturnLocation(invitationId!));
      window.dispatchEvent(new Event("hashchange"));
    }
  } catch {
    // The current in-app route remains available if storage is restricted.
  }
};

const handleIncomingNativeAuthUrl = async (url: string) => {
  try {
    const result = await nativeCallbackHandler(url);
    if (!result || result.status === "duplicate") return;
    if (result.kind !== "recovery") restorePostAuthRoute();
    if (result.kind === "oauth") {
      nativeOAuthInProgress = false;
      await clearNativeBrowserFinishedListener();
      window.dispatchEvent(new Event(nativeOAuthSuccessEvent));
    }
    const { Browser } = await import("@capacitor/browser");
    await Browser.close().catch(() => undefined);
  } catch (error) {
    window.dispatchEvent(new Event(nativeAuthLinkErrorEvent));
    if (nativeOAuthInProgress) emitNativeOAuthError(error);
    nativeOAuthInProgress = false;
    await clearNativeBrowserFinishedListener();
  }
};

export const ensureNativeAuthListener = async () => {
  if (!Capacitor.isNativePlatform()) return;
  nativeListenerActive = true;
  nativeListenerGeneration += 1;
  if (!nativeOAuthListener) {
    nativeOAuthListener = import("@capacitor/app")
      .then(async ({ App }) => {
        nativeListenerHandle = await App.addListener("appUrlOpen", ({ url }) => {
          void handleIncomingNativeAuthUrl(url);
        });
        if (!nativeListenerActive) {
          await nativeListenerHandle.remove();
          nativeListenerHandle = null;
          return;
        }
        const launch = await App.getLaunchUrl();
        if (launch?.url) await handleIncomingNativeAuthUrl(launch.url);
      })
      .catch((error) => {
        nativeOAuthListener = null;
        throw error;
      });
  }

  await nativeOAuthListener;
};

export const removeNativeAuthListener = async () => {
  nativeListenerActive = false;
  const generation = ++nativeListenerGeneration;
  await nativeOAuthListener?.catch(() => undefined);
  if (generation !== nativeListenerGeneration) return;
  await nativeListenerHandle?.remove();
  nativeListenerHandle = null;
  nativeOAuthListener = null;
};

const startNativeGoogleSignIn = async () => {
  if (nativeOAuthInProgress) return;
  nativeOAuthInProgress = true;
  try {
    await ensureNativeAuthListener();

    const { data, error } = await getClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: nativeOAuthRedirectUrl,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      throw mapSupabaseAuthError(error, "oauth_failure");
    }

    if (!data.url) {
      throw new Error("Google sign-in did not return an authorization URL.");
    }

    const { Browser } = await import("@capacitor/browser");
    await clearNativeBrowserFinishedListener();
    nativeBrowserFinishedListener = await Browser.addListener("browserFinished", () => {
      void clearNativeBrowserFinishedListener();
      if (!nativeOAuthInProgress) return;
      nativeOAuthInProgress = false;
      emitNativeOAuthError(new Error("Google sign-in was cancelled."));
    });
    await Browser.open({ url: data.url });
  } catch (error) {
    nativeOAuthInProgress = false;
    await clearNativeBrowserFinishedListener();
    throw error;
  }
};

export const signInWithMagicLink = async (email: string) => {
  rememberPostAuthRoute();
  return authActions.signInWithMagicLink(email);
};

export const registerWithEmailPassword = async (email: string, password: string) => {
  rememberPostAuthRoute();
  return authActions.registerWithEmailPassword(email, password);
};

export const signInWithEmailPassword = async (email: string, password: string) =>
  authActions.signInWithEmailPassword(email, password);

export const requestPasswordReset = async (email: string) => authActions.requestPasswordReset(email);

export const updatePassword = async (password: string, confirmPassword: string) =>
  authActions.updatePassword(password, confirmPassword);

export const signInWithGoogle = async () => {
  rememberPostAuthRoute();
  if (Capacitor.isNativePlatform()) {
    return startNativeGoogleSignIn();
  }

  return authActions.signInWithGoogle();
};

export const signOut = async () => {
  const { error } = await getClient().auth.signOut();
  if (error) {
    throw new Error("Sign-out failed.");
  }
};

export const getCurrentSession = async () => {
  const { data, error } = await getClient().auth.getSession();
  if (error) {
    throw new Error("Session could not be loaded.");
  }

  return data.session;
};

export const exchangeAuthCodeForSession = createSingleFlightAuthCodeExchange(async (code) => {
  const { error } = await getClient().auth.exchangeCodeForSession(code);
  if (error) throw new Error("Authentication link is invalid or expired.");
});

export const getCurrentUser = async () => {
  const { data, error } = await getClient().auth.getUser();
  if (error) {
    throw new Error("User could not be loaded.");
  }

  return data.user;
};

export const onAuthStateChange = (callback: AuthStateChangeCallback) =>
  getClient().auth.onAuthStateChange(callback);

export const bootstrapAuthenticatedAccount = async (user: User) => {
  const client = getClient();
  const { error: profileError } = await client.from("profiles").upsert(
    {
      display_name: profileDisplayName(user),
      id: user.id,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );

  if (profileError) {
    throw new Error("Profile could not be prepared.");
  }

  const households = await getUserHouseholds();
  if (households.length > 0) {
    return households[0];
  }

  return null;
};
