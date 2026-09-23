import type { HouseholdInvite } from "../lib/plantieRepository";

export const createInviteUrl = (token: string, currentHref = window.location.href) => {
  const url = new URL(currentHref);
  url.search = "";
  url.hash = `#/join?invite=${encodeURIComponent(token)}`;
  return url.toString();
};

export const normalizeInviteTokenInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    const hashQuery = parsed.hash.match(/^#\/join(?:\?(.+))?$/)?.[1] ?? "";
    return new URLSearchParams(hashQuery).get("invite")?.trim() ?? trimmed;
  } catch {
    const hashQuery = trimmed.match(/^#\/join(?:\?(.+))?$/)?.[1] ?? "";
    return hashQuery ? new URLSearchParams(hashQuery).get("invite")?.trim() ?? "" : trimmed;
  }
};

export const isLikelyInviteToken = (value: string) => value.length >= 32 && /^[A-Za-z0-9_-]+$/.test(value);

export const isActiveInvite = (invite: HouseholdInvite) => !invite.usedAt && !invite.revokedAt;

const readableErrorMessage = (error: unknown) => {
  const details = typeof error === "object" && error !== null ? error as { code?: string; details?: string; hint?: string; message?: string } : {};
  return [details.message, details.details, details.hint, details.code]
    .filter((item): item is string => typeof item === "string")
    .join(" ")
    .toLowerCase();
};

export const inviteErrorMessage = (error: unknown) => {
  const message = readableErrorMessage(error);

  if (message.includes("active invite already exists") || message.includes("duplicate")) {
    return "household.inviteStatusDuplicate";
  }

  if (message.includes("invalid invite email") || message.includes("valid family member email") || message.includes("invalid email")) {
    return "household.inviteStatusInvalidEmail";
  }

  if (message.includes("permission") || message.includes("access") || message.includes("owner") || message.includes("editor") || message.includes("42501")) {
    return "household.inviteStatusPermission";
  }

  if (message.includes("jwt") || message.includes("auth") || message.includes("not authenticated") || message.includes("401")) {
    return "household.inviteStatusAuth";
  }

  if (message.includes("schema cache") || message.includes("pgrst202") || message.includes("could not find the function")) {
    return "household.inviteStatusConfig";
  }

  return "household.inviteStatusGeneric";
};

export const safeInviteDebugMessage = (error: unknown, isProduction = import.meta.env.PROD) => {
  if (isProduction || typeof error !== "object" || error === null) {
    return "";
  }

  const details = error as { code?: string; details?: string; hint?: string; message?: string };
  return [details.code, details.message, details.details, details.hint]
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .join(" | ")
    .slice(0, 240);
};

export const joinInviteErrorMessage = (error: unknown) => {
  const message = readableErrorMessage(error);

  if (message.includes("revoked") || message.includes("invalid") || message.includes("used")) {
    return "household.inviteStatusInvalidInvite";
  }

  if (message.includes("jwt") || message.includes("auth") || message.includes("not authenticated") || message.includes("401")) {
    return "household.inviteStatusAuthRequired";
  }

  if (message.includes("schema cache") || message.includes("pgrst202") || message.includes("could not find the function")) {
    return "household.inviteStatusConfig";
  }

  return "household.joinFailed";
};
