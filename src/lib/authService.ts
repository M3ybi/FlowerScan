import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { getUserHouseholds } from "./plantieRepository";
import { supabase } from "./supabase";
import { createAuthActions, createAuthRedirectUrl } from "./authRules";
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

const getRedirectUrl = () => {
  if (typeof window === "undefined") {
    return undefined;
  }

  return createAuthRedirectUrl(window.location.href);
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

export const signInWithMagicLink = async (email: string) => authActions.signInWithMagicLink(email);

export const registerWithEmailPassword = async (email: string, password: string) =>
  authActions.registerWithEmailPassword(email, password);

export const signInWithEmailPassword = async (email: string, password: string) =>
  authActions.signInWithEmailPassword(email, password);

export const requestPasswordReset = async (email: string) => authActions.requestPasswordReset(email);

export const updatePassword = async (password: string, confirmPassword: string) =>
  authActions.updatePassword(password, confirmPassword);

export const signInWithGoogle = async () => authActions.signInWithGoogle();

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
    { onConflict: "id" },
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
