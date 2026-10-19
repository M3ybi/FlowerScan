import {
  currentHouseholdBaseUrl
} from "../../../app/appFormatting";
import {
  isLikelyInviteToken,
  joinInviteErrorMessage,
  normalizeInviteTokenInput
} from "../../../app/householdInvites";
import { useAuth } from "../../../hooks/useAuth";
import { useHouseholdDirectory } from "../../../hooks/useHouseholdDirectory";
import { useHouseholdInvitations } from "../../../hooks/useHouseholdInvitations";
import { signOut } from "../../../lib/authService";
import { browserStorage } from "../../../lib/browserStorage.js";
import { householdInvitationsChangedEvent } from "../../../lib/householdInvitationRules";
import { householdAfterInviteAcceptance, readSelectedHouseholdId, resolveHouseholdSelection, writeSelectedHouseholdId } from "../../../lib/householdSelection";
import { createTranslator } from "../../../lib/i18n";
import { clearInvitationAuthContext } from "../../../lib/invitationAuthContext";
import type { Household, HouseholdInvitation } from "../../../lib/plantieRepository";
import {
  acceptHouseholdInvitation,
  declineHouseholdInvitation
} from "../../../lib/plantieRepository";
import type { SupabaseReadThroughState } from "../../../lib/supabaseReadThrough";
import {
  invalidateSupabaseReadThroughCache
} from "../../../lib/supabaseReadThrough";
import type { HouseholdSession } from "../../../utils/household";
import {
  clearHouseholdSession,
  getStoredHouseholdSession,
  storeHouseholdSession
} from "../../../utils/household";

type Dependencies = {
  pendingInviteStorageKey: "plantie-pending-household-invite-v1";
  setJoinInviteInput: React.Dispatch<React.SetStateAction<string>>;
  joinInviteInput: string;
  setInviteStatus: React.Dispatch<React.SetStateAction<string>>;
  t: ReturnType<typeof createTranslator>;
  joinInviteOnceRef: React.MutableRefObject<(<T>(join: () => Promise<T>) => Promise<T | undefined>)>;
  auth: ReturnType<typeof useAuth>;
  decliningInvitationRef: React.MutableRefObject<boolean>;
  invitationRouteKey: string;
  householdOperationScopeRef: React.MutableRefObject<{ userId: string | null; householdToken: string | null; generation: number; }>;
  invitationRouteKeyRef: React.MutableRefObject<string>;
  activeHousehold: HouseholdSession | null;
  setInboxInvitationActionError: React.Dispatch<React.SetStateAction<string>>;
  setInvitationActionError: React.Dispatch<React.SetStateAction<string>>;
  setIsJoiningInvite: React.Dispatch<React.SetStateAction<boolean>>;
  householdDirectory: ReturnType<typeof useHouseholdDirectory>;
  invitationInbox: ReturnType<typeof useHouseholdInvitations>;
  invitationReview: { invitation: HouseholdInvitation | null; loading: boolean; error: boolean; refresh: () => void; };
  inboxInvitationReview: { invitation: HouseholdInvitation | null; loading: boolean; error: boolean; refresh: () => void; };
  householdDataGenerationRef: React.MutableRefObject<number>;
  setActiveHousehold: React.Dispatch<React.SetStateAction<HouseholdSession | null>>;
  setBaseUrl: React.Dispatch<React.SetStateAction<string>>;
  setAcceptedInboxInvitationHousehold: React.Dispatch<React.SetStateAction<Household | null>>;
  setAcceptedInvitationHousehold: React.Dispatch<React.SetStateAction<Household | null>>;
  isJoiningInvite: boolean;
  setIsDecliningInvitation: React.Dispatch<React.SetStateAction<boolean>>;
  signingOutRef: React.MutableRefObject<boolean>;
  setSupabaseReadState: React.Dispatch<React.SetStateAction<SupabaseReadThroughState | null>>;
};

export const useInvitationReviewActions = ({
  pendingInviteStorageKey,
  setJoinInviteInput,
  joinInviteInput,
  setInviteStatus,
  t,
  joinInviteOnceRef,
  auth,
  decliningInvitationRef,
  invitationRouteKey,
  householdOperationScopeRef,
  invitationRouteKeyRef,
  activeHousehold,
  setInboxInvitationActionError,
  setInvitationActionError,
  setIsJoiningInvite,
  householdDirectory,
  invitationInbox,
  invitationReview,
  inboxInvitationReview,
  householdDataGenerationRef,
  setActiveHousehold,
  setBaseUrl,
  setAcceptedInboxInvitationHousehold,
  setAcceptedInvitationHousehold,
  isJoiningInvite,
  setIsDecliningInvitation,
  signingOutRef,
  setSupabaseReadState
}: Dependencies) => {
  const leaveInvitationReview = () => {
    clearInvitationAuthContext(browserStorage);
    browserStorage.removeItem(pendingInviteStorageKey);
    setJoinInviteInput("");
    window.location.hash = "#/menu";
  };

  const handleJoinInvite = (input = joinInviteInput) => {
    const token = normalizeInviteTokenInput(input);
    if (!token || !isLikelyInviteToken(token)) {
      setInviteStatus(t(token ? "household.inviteStatusInvalidInvite" : "household.inviteStatusMissingToken"));
      return false;
    }

    setInviteStatus("");
    window.location.hash = `#/join?invite=${encodeURIComponent(token)}`;
    return true;
  };

  const handleAcceptInvitation = (invitation: HouseholdInvitation, source: "route" | "inbox" = "route") => joinInviteOnceRef.current(async () => {
    const userId = auth.user?.id;
    if (!userId || !auth.user?.email_confirmed_at || decliningInvitationRef.current) return false;
    const reviewKey = invitationRouteKey;
    const isCurrentAccount = () => householdOperationScopeRef.current.userId === userId;
    const isCurrent = () => isCurrentAccount() && invitationRouteKeyRef.current === reviewKey;
    const currentHousehold = activeHousehold;
    const setActionError = source === "inbox" ? setInboxInvitationActionError : setInvitationActionError;
    try {
      setIsJoiningInvite(true);
      setActionError("");
      const household = await acceptHouseholdInvitation(invitation.id);
      if (!isCurrentAccount()) return false;
      householdDirectory.includeConfirmedHousehold(household);
      invitationInbox.removeInvitation(invitation.id);
      invitationReview.refresh();
      inboxInvitationReview.refresh();
      // Membership and inbox updates remain relevant when the review was closed.
      window.dispatchEvent(new Event(householdInvitationsChangedEvent));
      const [households] = await Promise.all([householdDirectory.refresh(true), invitationInbox.refresh()]);
      if (!isCurrent()) return false;
      // Joining adds a membership; it does not replace an existing household selection.
      if (source === "route" && households && !currentHousehold && !getStoredHouseholdSession()) {
        const preferred = readSelectedHouseholdId(browserStorage, userId);
        const existing = resolveHouseholdSelection(households.filter((item) => item.id !== household.id), preferred);
        const selected = householdAfterInviteAcceptance(existing, household);
        const session = { name: selected.name, publicToken: selected.id };
        householdDataGenerationRef.current += 1;
        invalidateSupabaseReadThroughCache();
        storeHouseholdSession(session);
        writeSelectedHouseholdId(browserStorage, userId, selected.id);
        setActiveHousehold(session);
        setBaseUrl(currentHouseholdBaseUrl(session.publicToken));
      }
      browserStorage.removeItem(pendingInviteStorageKey);
      clearInvitationAuthContext(browserStorage);
      if (source === "inbox") setAcceptedInboxInvitationHousehold(household);
      else setAcceptedInvitationHousehold(household);
      return true;
    } catch (error) {
      if (isCurrent()) {
        setActionError(t(joinInviteErrorMessage(error)));
        (source === "inbox" ? inboxInvitationReview : invitationReview).refresh();
      }
      return false;
    } finally {
      setIsJoiningInvite(false);
    }
  });

  const handleDeclineInvitation = async (invitation: HouseholdInvitation, source: "route" | "inbox" = "route") => {
    const userId = auth.user?.id;
    if (!userId || !auth.user?.email_confirmed_at || decliningInvitationRef.current || isJoiningInvite) return;
    const reviewKey = invitationRouteKey;
    const isCurrentAccount = () => householdOperationScopeRef.current.userId === userId;
    const isCurrent = () => isCurrentAccount() && invitationRouteKeyRef.current === reviewKey;
    const setActionError = source === "inbox" ? setInboxInvitationActionError : setInvitationActionError;
    decliningInvitationRef.current = true;
    setIsDecliningInvitation(true);
    setActionError("");
    try {
      await declineHouseholdInvitation(invitation.id);
      if (!isCurrentAccount()) return;
      invitationInbox.removeInvitation(invitation.id);
      invitationReview.refresh();
      inboxInvitationReview.refresh();
      window.dispatchEvent(new Event(householdInvitationsChangedEvent));
      await invitationInbox.refresh();
      if (!isCurrent()) return;
      clearInvitationAuthContext(browserStorage);
    } catch (error) {
      if (isCurrent()) setActionError(t(joinInviteErrorMessage(error)));
    } finally {
      decliningInvitationRef.current = false;
      setIsDecliningInvitation(false);
    }
  };

  const handleInvitationAccountChange = async (source: "route" | "inbox" = "route") => {
    if (signingOutRef.current) return;
    const userId = auth.user?.id ?? null;
    signingOutRef.current = true;
    try {
      await signOut();
      if (householdOperationScopeRef.current.userId && householdOperationScopeRef.current.userId !== userId) return;
      clearHouseholdSession();
      setActiveHousehold(null);
      setSupabaseReadState(null);
    } catch {
      if (householdOperationScopeRef.current.userId !== userId) return;
      (source === "inbox" ? setInboxInvitationActionError : setInvitationActionError)(t("account.signOutFailed"));
    } finally {
      signingOutRef.current = false;
    }
  };
  return { leaveInvitationReview, handleJoinInvite, handleAcceptInvitation, handleDeclineInvitation, handleInvitationAccountChange };
};
