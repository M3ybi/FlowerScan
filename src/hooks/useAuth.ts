import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import type { Session, User } from "@supabase/supabase-js";
import {
  bootstrapAuthenticatedAccount,
  ensureNativeAuthListener,
  exchangeAuthCodeForSession,
  getCurrentSession,
  nativeAuthLinkErrorEvent,
  onAuthStateChange,
  removeNativeAuthListener,
} from "../lib/authService";
import { authReturnInvitationStorageKey, authReturnPathStorageKey, readWebAuthCallback, resolveAuthCallbackReturnLocation, safeAuthReturnLocation } from "../lib/authRedirects";
import { isSupabaseConfigured } from "../lib/supabase";
import { invitationReturnLocation, readInvitationAuthContext } from "../lib/invitationAuthContext";

export type AuthState = {
  callbackError: boolean;
  dismissCallbackError: () => void;
  isAuthenticated: boolean;
  isPasswordRecovery: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
};

const finishWebCallback = (kind: "callback" | "recovery", error: boolean, callbackInvitationId?: string) => {
  let savedPath: string | null = null;
  let savedInvitationId: string | null = null;
  try {
    savedPath = window.sessionStorage.getItem(authReturnPathStorageKey);
    savedInvitationId = window.sessionStorage.getItem(authReturnInvitationStorageKey);
    window.sessionStorage.removeItem(authReturnPathStorageKey);
    window.sessionStorage.removeItem(authReturnInvitationStorageKey);
  } catch {
    // Private browsing may restrict sessionStorage; the fallback stays internal.
  }
  let invitationId = callbackInvitationId ?? null;
  try { invitationId ??= readInvitationAuthContext(window.localStorage); } catch { /* Storage can be restricted. */ }
  const destination = kind === "recovery" || error ? "/#/menu?section=account"
    : callbackInvitationId ? resolveAuthCallbackReturnLocation(savedPath, callbackInvitationId, savedInvitationId)
    : savedPath ? safeAuthReturnLocation(savedPath) : invitationId ? invitationReturnLocation(invitationId) : safeAuthReturnLocation(savedPath);
  window.history.replaceState(window.history.state, "", destination);
  window.dispatchEvent(new Event("hashchange"));
};

export const useAuth = (): AuthState => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [callbackError, setCallbackError] = useState(false);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let mounted = true;
    let lastEvent: string | null = null;
    let lastEventSession: Session | null = null;
    let bootstrappedUserId: string | null = null;
    let recoveryVerified = false;
    let initializing = true;

    const applySession = (nextSession: Session | null) => {
      if (!mounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (!nextSession?.user) {
        bootstrappedUserId = null;
        return;
      }
      if (bootstrappedUserId === nextSession.user.id) return;
      bootstrappedUserId = nextSession.user.id;
      // Supabase auth callbacks must stay synchronous; database work starts afterward.
      window.setTimeout(() => {
        if (!mounted) return;
        void bootstrapAuthenticatedAccount(nextSession.user).catch(() => {
          if (bootstrappedUserId === nextSession.user.id) bootstrappedUserId = null;
        });
      }, 0);
    };

    const { data } = onAuthStateChange((event, nextSession) => {
      lastEvent = event;
      lastEventSession = nextSession;
      applySession(nextSession);
      if (event === "PASSWORD_RECOVERY") {
        recoveryVerified = true;
        setIsPasswordRecovery(true);
      }
      if (event === "SIGNED_OUT" || event === "USER_UPDATED") setIsPasswordRecovery(false);
    });

    const initialize = async () => {
      const callback = Capacitor.isNativePlatform() ? null : readWebAuthCallback(window.location.href);
      let callbackFailed = callback?.error ?? false;
      if (callback?.code) {
        try {
          await exchangeAuthCodeForSession(callback.code);
        } catch {
          callbackFailed = true;
        }
      }
      try {
        const restoredSession = await getCurrentSession();
        const effectiveSession = lastEvent === "SIGNED_OUT" ? null : restoredSession ?? lastEventSession;
        if (!lastEvent || (lastEvent === "INITIAL_SESSION" && !lastEventSession && effectiveSession)) {
          applySession(effectiveSession);
        }
        if (mounted) {
          const error = Boolean(callback && (callbackFailed || !effectiveSession ||
            (callback.kind === "recovery" && !recoveryVerified)));
          if (callback) {
            finishWebCallback(callback.kind, error, callback.invitationId);
            setCallbackError(error);
          }
        }
      } catch {
        if (!lastEvent) applySession(null);
        if (mounted) {
          if (callback) {
            finishWebCallback(callback.kind, true, callback.invitationId);
            setCallbackError(true);
          }
        }
      } finally {
        initializing = false;
        if (mounted) setLoading(false);
      }
    };
    void initialize();

    const refreshOnFocus = () => {
      if (initializing || document.visibilityState === "hidden") return;
      void getCurrentSession().then(applySession).catch(() => undefined);
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);
    const handleNativeError = () => setCallbackError(true);
    window.addEventListener(nativeAuthLinkErrorEvent, handleNativeError);
    if (Capacitor.isNativePlatform()) void ensureNativeAuthListener().catch(handleNativeError);
    let nativeResumeListener: { remove(): Promise<void> } | null = null;
    if (Capacitor.isNativePlatform()) {
      void import("@capacitor/app").then(({ App }) => App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) refreshOnFocus();
      })).then((listener) => {
        if (mounted) nativeResumeListener = listener;
        else void listener.remove();
      }).catch(() => undefined);
    }

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
      window.removeEventListener(nativeAuthLinkErrorEvent, handleNativeError);
      if (Capacitor.isNativePlatform()) void removeNativeAuthListener();
      void nativeResumeListener?.remove();
    };
  }, []);

  return {
    callbackError,
    dismissCallbackError: () => setCallbackError(false),
    isAuthenticated: Boolean(user),
    isPasswordRecovery,
    loading,
    session,
    user,
  };
};
