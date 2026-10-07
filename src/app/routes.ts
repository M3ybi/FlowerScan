import { useEffect, useState } from "react";
import type { LegalPageId } from "../lib/releaseReadiness";
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
    const params = new URLSearchParams(match[2] ?? "");
    return {
      page: "detail",
      flowerId: decodeURIComponent(match[1]),
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

export const useHashRoute = () => {
  const [hash, setHash] = useState(() => window.location.hash || "#/");

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return parseHashRoute(hash);
};

export const isRouteAllowedWithoutHousehold = (route: AppRoute) =>
  route.page === "menu" ||
  route.page === "join" ||
  route.page === "legal" ||
  route.page === "release-readiness" ||
  route.page === "health";
