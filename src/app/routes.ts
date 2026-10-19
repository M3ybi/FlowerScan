import { useEffect, useState } from "react";
import type { LegalPageId } from "../lib/releaseReadiness.js";
import { isInvitationId } from "../lib/householdInvitationRules.js";

export type AppRoute =
  | { page: "dashboard" }
  | { page: "detail"; flowerId: string; panel: "diagnostics" | ""; scan: boolean }
  | { page: "diagnose" }
  | { page: "health" }
  | { page: "join"; invite: string; invitationId?: string }
  | { page: "legal"; legalPageId: LegalPageId }
  | { page: "menu"; section: string }
  | { page: "qr" }
  | { page: "release-readiness" };

export const parseHashRoute = (hash: string): AppRoute => {
  const normalizedHash = hash || "#/";
  const match = normalizedHash.match(/^#\/flower\/([^/?]+)(?:\?(.+))?$/);
  if (match) {
    let flowerId: string;
    try { flowerId = decodeURIComponent(match[1]); }
    catch { return { page: "dashboard" }; }
    const params = new URLSearchParams(match[2] ?? "");
    return {
      page: "detail",
      flowerId,
      panel: params.get("panel") === "diagnostics" ? "diagnostics" : "",
      scan: params.get("scan") === "1",
    };
  }

  if (normalizedHash === "#/qr") {
    return { page: "qr" };
  }

  if (normalizedHash === "#/diagnose") {
    return { page: "diagnose" };
  }

  const menuMatch = normalizedHash.match(/^#\/(?:account|menu)(?:\?(.+))?$/);
  if (menuMatch) {
    const params = new URLSearchParams(menuMatch[1] ?? "");
    return { page: "menu", section: params.get("section") ?? "" };
  }

  const joinMatch = normalizedHash.match(/^#\/join(?:\?(.+))?$/);
  if (joinMatch) {
    const params = new URLSearchParams(joinMatch[1] ?? "");
    const invitations = params.getAll("invitation");
    const invitationId = invitations.length === 1 && isInvitationId(invitations[0]) ? invitations[0] : null;
    return { invite: params.get("invite") ?? "", page: "join", ...(invitationId ? { invitationId } : {}) };
  }

  const legalPageMatch = normalizedHash.match(/^#\/(privacy|terms|support|delete-account|subscription-terms)$/);
  if (legalPageMatch) {
    return { page: "legal", legalPageId: legalPageMatch[1] as LegalPageId };
  }

  if (normalizedHash === "#/release-readiness") {
    return { page: "release-readiness" };
  }

  if (normalizedHash === "#/health") {
    return { page: "health" };
  }

  return { page: "dashboard" };
};

const readRouteLocation = (): RouteLocation => ({ pathname: window.location.pathname, search: window.location.search, hash: window.location.hash });

export const useHashRoute = (auth: EntryAuthState) => {
  const [location, setLocation] = useState(readRouteLocation);
  const { route, replaceHash } = resolveEntryRoute(location, auth);

  useEffect(() => {
    const handleHashChange = () => setLocation(readRouteLocation());
    window.addEventListener("hashchange", handleHashChange);
    window.addEventListener("popstate", handleHashChange);
    handleHashChange();
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      window.removeEventListener("popstate", handleHashChange);
    };
  }, []);

  useEffect(() => {
    if (!replaceHash || resolveEntryRoute(readRouteLocation(), auth).replaceHash !== replaceHash) return;
    window.history.replaceState(window.history.state, "", `${location.pathname}${location.search}${replaceHash}`);
    window.dispatchEvent(new Event("hashchange"));
  }, [replaceHash, location, auth]);

  return route;
};

export const isRouteAllowedWithoutHousehold = (route: AppRoute) =>
  route.page === "menu" ||
  route.page === "join" ||
  route.page === "legal" ||
  route.page === "release-readiness" ||
  route.page === "health";

type EntryAuthState = {
  loading: boolean; isAuthenticated: boolean; isPasswordRecovery: boolean;
  invalidRecoveryLink: boolean; callbackError: boolean;
};
type RouteLocation = Pick<Location, "pathname" | "search" | "hash">;
const accountEntryHash = "#/menu?section=account";

export const resolveEntryRoute = (location: RouteLocation, auth: EntryAuthState): { route: AppRoute; replaceHash: string | null } => {
  const route = parseHashRoute(location.hash);
  const params = new URLSearchParams(location.search);
  const authCallback = /^\/auth\/(?:callback|recovery)\/?$/.test(location.pathname)
    || ["code", "token", "token_hash", "error", "error_code"].some(key => params.has(key));
  if (auth.loading || auth.isAuthenticated || auth.isPasswordRecovery || auth.invalidRecoveryLink || auth.callbackError) {
    return { route, replaceHash: null };
  }
  const root = ["", "/"].includes(location.hash.replace(/^#/, "").split("?")[0]);
  // Keep protected deep-link URLs for the existing Auth return flow, displaying
  // the same account entry while signed out. Only a legacy root is replaced.
  return { route: isRouteAllowedWithoutHousehold(route) ? route : { page: "menu", section: "account" }, replaceHash: root && !authCallback ? accountEntryHash : null };
};
