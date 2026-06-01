import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { createHousehold, getUserHouseholds } from "./plantieRepository";
import { supabase } from "./supabase";

export type AuthStateChangeCallback = (event: AuthChangeEvent, session: Session | null) => void;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  return window.location.href;
};

const profileDisplayName = (user: User) => {
  const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name;
  if (typeof metadataName === "string" && metadataName.trim()) {
    return metadataName.trim().slice(0, 120);
  }

  return user.email?.split("@")[0]?.slice(0, 120) ?? null;
};

export const validateAuthEmail = (email: string) => emailPattern.test(email.trim());

export const signInWithMagicLink = async (email: string) => {
  const normalizedEmail = email.trim().toLowerCase();
  if (!validateAuthEmail(normalizedEmail)) {
    throw new Error("Zadaj platnú emailovú adresu.");
  }

  const { error } = await getClient().auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      emailRedirectTo: getRedirectUrl(),
    },
  });

  if (error) {
    throw new Error("Prihlasovací email sa nepodarilo odoslať.");
  }
};

export const signInWithGoogle = async () => {
  const { error } = await getClient().auth.signInWithOAuth({
    options: {
      redirectTo: getRedirectUrl(),
    },
    provider: "google",
  });

  if (error) {
    throw new Error("Prihlásenie cez Google sa nepodarilo spustiť.");
  }
};

export const signOut = async () => {
  const { error } = await getClient().auth.signOut();
  if (error) {
    throw new Error("Odhlásenie sa nepodarilo.");
  }
};

export const getCurrentSession = async () => {
  const { data, error } = await getClient().auth.getSession();
  if (error) {
    throw new Error("Reláciu sa nepodarilo načítať.");
  }

  return data.session;
};

export const getCurrentUser = async () => {
  const { data, error } = await getClient().auth.getUser();
  if (error) {
    throw new Error("Používateľa sa nepodarilo načítať.");
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
    throw new Error("Profil sa nepodarilo pripraviť.");
  }

  const households = await getUserHouseholds();
  if (households.length > 0) {
    return households[0];
  }

  return createHousehold("Moja domácnosť");
};

