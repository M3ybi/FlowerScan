import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  bootstrapAuthenticatedAccount,
  getCurrentSession,
  onAuthStateChange,
} from "../lib/authService";
import { isSupabaseConfigured } from "../lib/supabase";

export type AuthState = {
  isAuthenticated: boolean;
  isPasswordRecovery: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
};

const hasPasswordRecoveryParams = () => {
  if (typeof window === "undefined") {
    return false;
  }

  const source = `${window.location.search}&${window.location.hash}`;
  return source.includes("type=recovery");
};

export const useAuth = (): AuthState => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(hasPasswordRecoveryParams);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const applySession = async (nextSession: Session | null) => {
      if (!isMounted) {
        return;
      }

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (nextSession?.user) {
        try {
          await bootstrapAuthenticatedAccount(nextSession.user);
        } catch {
          // Auth remains valid even if optional bootstrap fails; surface detailed errors when the feature is wired in.
        }
      }
    };

    void getCurrentSession()
      .then(applySession)
      .catch(() => applySession(null))
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    const { data } = onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsPasswordRecovery(true);
      } else if (event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setIsPasswordRecovery(false);
      }
      void applySession(nextSession);
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return {
    isAuthenticated: Boolean(user),
    isPasswordRecovery,
    loading,
    session,
    user,
  };
};
