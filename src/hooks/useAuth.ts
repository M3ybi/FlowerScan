import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import type { Session, User } from "@supabase/supabase-js";
import {
  bootstrapAuthenticatedAccount,
  ensureNativeAuthListener,
  exchangeAuthCodeForSession,
  getCurrentSession,
  nativeAuthLinkErrorEvent,
  nativeAuthLinkSuccessEvent,
  onAuthStateChange,
  removeNativeAuthListener,
} from "../lib/authService";
import { authReturnInvitationStorageKey, authReturnPathStorageKey, readWebAuthCallback, resolveAuthCallbackReturnLocation, safeAuthReturnLocation } from "../lib/authRedirects";
import { isSupabaseConfigured } from "../lib/supabase";
import { invitationReturnLocation, readInvitationAuthContext } from "../lib/invitationAuthContext";
import { createPasswordRecoveryMarker, isPasswordRecoverySessionValid, readPasswordRecoveryMarker, writePasswordRecoveryMarker } from "../lib/passwordRecoverySession";
import type { PasswordRecoveryMarker } from "../lib/passwordRecoverySession";

export type AuthState = {
  callbackError: boolean;
  dismissCallbackError: () => void;
  invalidRecoveryLink: boolean;
  dismissRecoveryError: () => void;
  recoveryFlowId: number;
  isPasswordRecoveryFlowCurrent: (flowId: number) => boolean;
  beginPasswordRecoveryCompletion: (flowId?: number) => number | null;
  completePasswordRecovery: (flowId?: number) => boolean;
  isAuthenticated: boolean;
  isPasswordRecovery: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
};

const recoveryStorage = () => {
  try { return window.sessionStorage; } catch { return null; }
};

const finishWebCallback = (kind: "callback" | "recovery", error: boolean, callbackInvitationId?: string) => {
  let savedPath: string | null = null;
  let savedInvitationId: string | null = null;
  try {
    savedPath = window.sessionStorage.getItem(authReturnPathStorageKey);
    savedInvitationId = window.sessionStorage.getItem(authReturnInvitationStorageKey);
    // Recovery must not consume an invitation/confirmation return destination.
    if (kind !== "recovery") {
      window.sessionStorage.removeItem(authReturnPathStorageKey);
      window.sessionStorage.removeItem(authReturnInvitationStorageKey);
    }
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
  const [recoveryPhase, setRecoveryPhase] = useState<"none" | "active" | "finishing" | "invalid">("none");
  const [recoveryMarker, setRecoveryMarker] = useState<PasswordRecoveryMarker | null>(null);
  const [recoveryFlowId, setRecoveryFlowId] = useState(0);
  const recoveryGeneration = useRef(0);
  const recovery = useRef<{ phase: typeof recoveryPhase; marker: PasswordRecoveryMarker | null }>({ phase: "none", marker: null });
  const [callbackError, setCallbackError] = useState(false);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  const changeRecoveryPhase = (phase: typeof recoveryPhase, marker = recovery.current.marker) => {
    recovery.current = { phase, marker };
    setRecoveryPhase(phase);
    setRecoveryMarker(marker);
    writePasswordRecoveryMarker(recoveryStorage(), marker);
  };
  const advanceRecoveryFlow = () => {
    recoveryGeneration.current += 1;
    setRecoveryFlowId(recoveryGeneration.current);
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let mounted = true;
    let lastEvent: string | null = null;
    let lastEventSession: Session | null = null;
    let bootstrappedUserId: string | null = null;
    let initializing = true;
    const callback = Capacitor.isNativePlatform() ? null : readWebAuthCallback(window.location.href);
    const storedRecovery = readPasswordRecoveryMarker(recoveryStorage());
    if (storedRecovery) changeRecoveryPhase("active", storedRecovery);

    const applySession = (nextSession: Session | null) => {
      if (!mounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (recovery.current.phase === "active" && !isPasswordRecoverySessionValid(recovery.current.marker, nextSession)) {
        changeRecoveryPhase("invalid");
      }
      if (!nextSession?.user) {
        bootstrappedUserId = null;
        return;
      }
      if (recovery.current.phase !== "none" || bootstrappedUserId === nextSession.user.id) return;
      bootstrappedUserId = nextSession.user.id;
      // Supabase auth callbacks must stay synchronous; database work starts afterward.
      window.setTimeout(() => {
        if (!mounted || recovery.current.phase !== "none") return;
        void bootstrapAuthenticatedAccount(nextSession.user).catch(() => {
          if (bootstrappedUserId === nextSession.user.id) bootstrappedUserId = null;
        });
      }, 0);
    };

    const { data } = onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      lastEvent = event;
      lastEventSession = nextSession;
      if (event === "PASSWORD_RECOVERY") {
        advanceRecoveryFlow();
        const marker = createPasswordRecoveryMarker(nextSession);
        changeRecoveryPhase(marker ? "active" : "invalid", marker);
        setCallbackError(false);
      }
      // USER_UPDATED is emitted before updateUser resolves. Only explicit,
      // verified cleanup may release the recovery screen to normal sign-in.
      applySession(nextSession);
    });

    const initialize = async () => {
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
        const effectiveSession = lastEvent && lastEvent !== "INITIAL_SESSION" ? lastEventSession : restoredSession ?? lastEventSession;
        if (!lastEvent || (lastEvent === "INITIAL_SESSION" && !lastEventSession && effectiveSession)) {
          applySession(effectiveSession);
        }
        if (mounted) {
          const recoveryVerified = isPasswordRecoverySessionValid(recovery.current.marker, effectiveSession);
          if (storedRecovery && !callback) changeRecoveryPhase(recoveryVerified ? "active" : "invalid");
          const error = Boolean(callback && (callbackFailed || !effectiveSession ||
            (callback.kind === "recovery" && !recoveryVerified)));
          if (callback) {
            finishWebCallback(callback.kind, error, callback.invitationId);
            if (callback.kind === "recovery" && error) changeRecoveryPhase("invalid");
            else {
              setCallbackError(error);
              if (callback.kind === "callback" && !error) {
                advanceRecoveryFlow();
                changeRecoveryPhase("none", null);
                applySession(effectiveSession);
              }
            }
          }
        }
      } catch {
        if (!lastEvent) applySession(null);
        if (mounted) {
          if (callback) {
            finishWebCallback(callback.kind, true, callback.invitationId);
            if (callback.kind === "recovery") changeRecoveryPhase("invalid");
            else setCallbackError(true);
          } else if (recovery.current.phase === "active") changeRecoveryPhase("invalid");
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
    const handleNativeError = (event?: Event) => {
      if (!mounted) return;
      const kind = (event as CustomEvent<{ kind?: string }> | undefined)?.detail?.kind;
      if (kind === "recovery") changeRecoveryPhase("invalid");
      else if (kind === "oauth" || kind === "confirmation") {
        setCallbackError(true);
      } else if (recovery.current.phase !== "none") changeRecoveryPhase("invalid");
      else setCallbackError(true);
    };
    const handleNativeSuccess = (event: Event) => {
      if (!mounted) return;
      const kind = (event as CustomEvent<{ kind?: string }>).detail?.kind;
      if (kind === "recovery") {
        if (!isPasswordRecoverySessionValid(recovery.current.marker, lastEventSession)) changeRecoveryPhase("invalid");
      } else if (kind === "oauth" || kind === "confirmation") {
        advanceRecoveryFlow();
        changeRecoveryPhase("none", null);
        setCallbackError(false);
        applySession(lastEventSession);
      }
    };
    window.addEventListener(nativeAuthLinkErrorEvent, handleNativeError);
    window.addEventListener(nativeAuthLinkSuccessEvent, handleNativeSuccess);
    if (Capacitor.isNativePlatform()) void ensureNativeAuthListener().catch(() => handleNativeError());
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
      window.removeEventListener(nativeAuthLinkSuccessEvent, handleNativeSuccess);
      if (Capacitor.isNativePlatform()) void removeNativeAuthListener();
      void nativeResumeListener?.remove();
    };
  }, []);

  useEffect(() => {
    if (recoveryPhase !== "active" || !recoveryMarker) return;
    const timeout = window.setTimeout(() => {
      if (recovery.current.phase === "active" && recovery.current.marker === recoveryMarker) changeRecoveryPhase("invalid");
    }, Math.max(0, recoveryMarker.expiresAt - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [recoveryPhase, recoveryMarker]);

  return {
    callbackError,
    dismissCallbackError: () => setCallbackError(false),
    invalidRecoveryLink: recoveryPhase === "invalid",
    dismissRecoveryError: () => {
      advanceRecoveryFlow();
      changeRecoveryPhase("none", null);
    },
    recoveryFlowId,
    isPasswordRecoveryFlowCurrent: (flowId) => flowId === recoveryGeneration.current,
    beginPasswordRecoveryCompletion: (flowId = recoveryGeneration.current) => {
      if (flowId !== recoveryGeneration.current) return null;
      changeRecoveryPhase("finishing");
      return flowId;
    },
    completePasswordRecovery: (flowId = recoveryGeneration.current) => {
      if (flowId !== recoveryGeneration.current) return false;
      changeRecoveryPhase("none", null);
      setSession(null);
      setUser(null);
      advanceRecoveryFlow();
      return true;
    },
    isAuthenticated: Boolean(user) && recoveryPhase === "none",
    isPasswordRecovery: recoveryPhase === "active" || recoveryPhase === "finishing",
    loading,
    session,
    user,
  };
};
