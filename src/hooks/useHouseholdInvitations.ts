import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getHouseholdInvitation, listMyHouseholdInvitations } from "../lib/plantieRepository";
import type { HouseholdInvitation } from "../lib/plantieRepository";
import { householdInvitationsChangedEvent, isActionableHouseholdInvitation } from "../lib/householdInvitationRules";

export const loadInvitationReview = async (
  request: { token?: string; invitationId?: string },
  lookup = getHouseholdInvitation,
) => {
  const invitation = await lookup(request);
  // ID-only lookup intentionally returns no details for an unrelated account.
  // Keep account correction available without treating that result as token invalidity.
  return { invitation, error: !request.token && Boolean(request.invitationId) && !invitation };
};

export const useHouseholdInvitations = (user: User | null) => {
  const identity = user?.id && user.email_confirmed_at && user.email ? `${user.id}:${user.email.trim().toLowerCase()}` : "";
  const [state, setState] = useState<{ identity: string; invitations: HouseholdInvitation[]; loading: boolean; error: boolean }>({
    identity: "", invitations: [], loading: false, error: false,
  });
  const [now, setNow] = useState(Date.now);
  const generation = useRef(0);
  const activeRequest = useRef<{ identity: string; promise: Promise<void> } | null>(null);

  const refresh = useCallback((force = false): Promise<void> => {
    if (!identity) return Promise.resolve();
    if (!force && activeRequest.current?.identity === identity) return activeRequest.current.promise;
    const requestGeneration = ++generation.current;
    setState((previous) => ({
      identity, invitations: previous.identity === identity ? previous.invitations : [], loading: true, error: false,
    }));
    const promise = listMyHouseholdInvitations().then((invitations) => {
      if (generation.current !== requestGeneration) return;
      setNow(Date.now());
      setState({ identity, invitations, loading: false, error: false });
    }).catch(() => {
      if (generation.current !== requestGeneration) return;
      // Existing rows may have been revoked while offline; fail closed until a fresh response succeeds.
      setState({ identity, invitations: [], loading: false, error: true });
    }).finally(() => {
      if (activeRequest.current?.promise === promise) activeRequest.current = null;
    });
    activeRequest.current = { identity, promise };
    return promise;
  }, [identity]);

  useEffect(() => {
    generation.current += 1;
    activeRequest.current = null;
    setState({ identity, invitations: [], loading: Boolean(identity), error: false });
    void refresh();
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    const refreshAfterMutation = () => {
      if (document.visibilityState !== "hidden") void refresh(true);
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener(householdInvitationsChangedEvent, refreshAfterMutation);
    return () => {
      generation.current += 1;
      activeRequest.current = null;
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener(householdInvitationsChangedEvent, refreshAfterMutation);
    };
  }, [identity, refresh]);

  const invitations = state.identity === identity && identity
    ? state.invitations.filter((invite) => isActionableHouseholdInvitation(invite, Math.max(now, Date.now()))) : [];
  useEffect(() => {
    const nextExpiry = Math.min(...invitations.map((invitation) => Date.parse(invitation.expiresAt)));
    if (!Number.isFinite(nextExpiry)) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, nextExpiry - Date.now()) + 1);
    return () => window.clearTimeout(timer);
  }, [invitations]);

  return { invitations, loading: Boolean(identity) && (state.identity !== identity || state.loading), error: Boolean(identity) && state.identity === identity && state.error, refresh };
};

export const useHouseholdInvitation = ({ token, invitationId, user }: {
  token?: string;
  invitationId?: string;
  user: User | null;
}) => {
  const [invitation, setInvitation] = useState<HouseholdInvitation | null>(null);
  const [loading, setLoading] = useState(Boolean(token || invitationId));
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let current = true;
    setInvitation(null);
    setError(false);
    if (!token && (!invitationId || !user?.email_confirmed_at)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void loadInvitationReview({ token, invitationId }).then((review) => {
      if (!current) return;
      setInvitation(review.invitation);
      setError(review.error);
    }).catch(() => {
      if (current) setError(true);
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [token, invitationId, user?.id, user?.email, user?.email_confirmed_at, revision]);

  useEffect(() => {
    if (!invitation || invitation.status !== "pending") return;
    const expiresAt = Date.parse(invitation.expiresAt);
    if (!Number.isFinite(expiresAt)) return;
    const timer = window.setTimeout(() => {
      setInvitation((current) => current ? { ...current, status: "expired" } : current);
    }, Math.max(0, expiresAt - Date.now()) + 1);
    return () => window.clearTimeout(timer);
  }, [invitation]);
  return { invitation, loading, error, refresh };
};
