import { isValidHouseholdToken } from "../utils/household.js";
import { isInvitationId } from "./householdInvitationRules.js";

export type AuthRedirectPurpose = "callback" | "confirmation" | "recovery";

export const authReturnPathStorageKey = "plantie.auth.return-path";
export const authReturnInvitationStorageKey = "plantie.auth.return-invitation";

const isUnsupportedNumericRedirectHost = (hostname: string) => {
  if (hostname.startsWith("[") && hostname.endsWith("]")) return hostname !== "[::1]";
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname)) return !hostname.startsWith("127.");
  return false;
};

export const createAuthRedirectUrl = (currentUrl: string | undefined, purpose: AuthRedirectPurpose = "callback") => {
  if (!currentUrl) return undefined;
  try {
    const url = new URL(currentUrl);
    if (url.username || url.password || (url.protocol !== "https:" && url.protocol !== "http:") ||
      isUnsupportedNumericRedirectHost(url.hostname)) return undefined;
    const path = purpose === "recovery" ? "/auth/recovery" : "/auth/callback";
    return new URL(path, url.origin).href;
  } catch {
    return undefined;
  }
};

export const safeAuthReturnPath = (hash: string | null | undefined) => {
  if (!hash || hash.length > 2048 || !/^#\/(?!\/)/.test(hash) || /[\\\u0000-\u001f\u007f]/.test(hash)) return "#/menu";
  return hash;
};

export const createAuthReturnLocation = (currentUrl: string) => {
  try {
    const url = new URL(currentUrl);
    const householdIds = url.searchParams.getAll("householdId");
    const legacyHouseholdIds = url.searchParams.getAll("household");
    const token = householdIds.length === 1 && legacyHouseholdIds.length === 0 ? householdIds[0]
      : legacyHouseholdIds.length === 1 && householdIds.length === 0 ? legacyHouseholdIds[0] : null;
    const query = isValidHouseholdToken(token) ? `?householdId=${encodeURIComponent(token)}` : "";
    return `/${query}${safeAuthReturnPath(url.hash)}`;
  } catch {
    return "/#/menu";
  }
};

export const safeAuthReturnLocation = (storedLocation: string | null | undefined) => {
  if (!storedLocation || storedLocation.length > 2300) return "/#/menu";
  if (storedLocation.startsWith("#")) return `/${safeAuthReturnPath(storedLocation)}`;
  if (!storedLocation.startsWith("/") || storedLocation.startsWith("//")) return "/#/menu";
  try {
    const url = new URL(storedLocation, "https://auth.plantie.invalid");
    if (url.origin !== "https://auth.plantie.invalid" || url.pathname !== "/" ||
      [...url.searchParams.keys()].some((key) => key !== "householdId") ||
      url.searchParams.getAll("householdId").length > 1) return "/#/menu";
    const token = url.searchParams.get("householdId");
    if (token !== null && !isValidHouseholdToken(token)) return "/#/menu";
    const query = token ? `?householdId=${encodeURIComponent(token)}` : "";
    return `/${query}${safeAuthReturnPath(url.hash)}`;
  } catch {
    return "/#/menu";
  }
};

export const resolveAuthCallbackReturnLocation = (
  savedLocation: string | null,
  callbackInvitationId?: string | null,
  savedInvitationId?: string | null,
) => {
  if (isInvitationId(callbackInvitationId) && callbackInvitationId !== savedInvitationId) {
    return `/#/join?invitation=${encodeURIComponent(callbackInvitationId)}`;
  }
  return safeAuthReturnLocation(savedLocation);
};

export const getAuthCallbackKind = (pathname: string): "callback" | "recovery" | null =>
  pathname === "/auth/recovery" ? "recovery" : pathname === "/auth/callback" ? "callback" : null;

export const hasAuthCallbackError = (url: string) => {
  try {
    const parsed = new URL(url);
    const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ""));
    return Boolean(parsed.searchParams.get("error") || parsed.searchParams.get("error_code") ||
      fragment.get("error") || fragment.get("error_code"));
  } catch {
    return true;
  }
};

export const readWebAuthCallback = (url: string) => {
  try {
    const parsed = new URL(url);
    const kind = getAuthCallbackKind(parsed.pathname);
    if (!kind) return null;
    const codes = parsed.searchParams.getAll("code");
    const invitations = parsed.searchParams.getAll("invitation");
    const invitationId = invitations.length === 1 && isInvitationId(invitations[0]) ? invitations[0] : null;
    const hasError = hasAuthCallbackError(url) || codes.length !== 1 || !codes[0] ||
      codes[0].length > 4096 || /[\u0000-\u001f\u007f]/.test(codes[0]);
    return { kind, code: hasError ? null : codes[0], error: hasError, ...(invitationId ? { invitationId } : {}) };
  } catch {
    return null;
  }
};

export const createSingleFlightAuthCodeExchange = (exchange: (code: string) => Promise<void>) => {
  let lastCode: string | null = null;
  let lastResult: Promise<void> | null = null;
  return (code: string) => {
    if (lastResult && code === lastCode) return lastResult;
    lastCode = code;
    lastResult = exchange(code);
    return lastResult;
  };
};
