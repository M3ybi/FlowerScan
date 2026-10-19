import {
  createInviteUrl,
  inviteErrorMessage,
  isActiveInvite,
  safeInviteDebugMessage
} from "../../../app/householdInvites";
import type { HouseholdPersonItem } from "../../../app/householdPeople";
import { useAuth } from "../../../hooks/useAuth";
import { householdInvitationsChangedEvent } from "../../../lib/householdInvitationRules";
import type { HouseholdPermissions } from "../../../lib/householdPermissions";
import { createTranslator } from "../../../lib/i18n";
import type { OnboardingStep } from "../../../lib/onboarding";
import type { HouseholdInvite, HouseholdMember } from "../../../lib/plantieRepository";
import {
  createHouseholdInvite,
  getHouseholdInviteToken,
  isValidInviteEmail,
  listHouseholdInvites,
  listHouseholdMembers,
  normalizeInviteEmail,
  removeHouseholdMember,
  revokeHouseholdInvite,
  sendHouseholdInviteEmail
} from "../../../lib/plantieRepository";
import type { SubscriptionSnapshot } from "../../../lib/subscriptionState";

type Dependencies = {
  auth: ReturnType<typeof useAuth>;
  activeSupabaseHouseholdId: string;
  isHouseholdOperationCurrent: (started?: { userId: string | null; householdToken: string | null; generation: number; }) => boolean;
  householdPeopleRequestRef: React.MutableRefObject<number>;
  setHouseholdPeopleLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setHouseholdPeopleError: React.Dispatch<React.SetStateAction<string>>;
  householdPeopleScopeRef: React.MutableRefObject<string>;
  setHouseholdMembers: React.Dispatch<React.SetStateAction<HouseholdMember[]>>;
  setHouseholdInvites: React.Dispatch<React.SetStateAction<HouseholdInvite[]>>;
  t: ReturnType<typeof createTranslator>;
  setInviteStatusTone: React.Dispatch<React.SetStateAction<"error" | "info" | "success">>;
  setInviteStatus: React.Dispatch<React.SetStateAction<string>>;
  isCreatingInvite: boolean;
  setOnboardingStep: React.Dispatch<React.SetStateAction<OnboardingStep>>;
  canInviteToHousehold: boolean;
  inviteEmail: string;
  householdMembers: HouseholdMember[];
  householdInvites: HouseholdInvite[];
  transientMessageGenerationRef: React.MutableRefObject<number>;
  setIsCreatingInvite: React.Dispatch<React.SetStateAction<boolean>>;
  isTransientMessageGenerationCurrent: (generation: number) => boolean;
  setInviteEmail: React.Dispatch<React.SetStateAction<string>>;
  setIsInvitePanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  refreshSubscriptionState: () => Promise<SubscriptionSnapshot>;
  householdPermissions: HouseholdPermissions;
  sendingInviteId: string | null;
  setSendingInviteId: React.Dispatch<React.SetStateAction<string | null>>;
  removingPersonKeysRef: React.MutableRefObject<Set<string>>;
  setRemovingPersonKeys: React.Dispatch<React.SetStateAction<Set<string>>>;
};

export const useInvitationActions = ({
  auth,
  activeSupabaseHouseholdId,
  isHouseholdOperationCurrent,
  householdPeopleRequestRef,
  setHouseholdPeopleLoading,
  setHouseholdPeopleError,
  householdPeopleScopeRef,
  setHouseholdMembers,
  setHouseholdInvites,
  t,
  setInviteStatusTone,
  setInviteStatus,
  isCreatingInvite,
  setOnboardingStep,
  canInviteToHousehold,
  inviteEmail,
  householdMembers,
  householdInvites,
  transientMessageGenerationRef,
  setIsCreatingInvite,
  isTransientMessageGenerationCurrent,
  setInviteEmail,
  setIsInvitePanelOpen,
  refreshSubscriptionState,
  householdPermissions,
  sendingInviteId,
  setSendingInviteId,
  removingPersonKeysRef,
  setRemovingPersonKeys
}: Dependencies) => {
  const refreshHouseholdPeople = async (showLoading = false) => {
    if (!auth.isAuthenticated || !activeSupabaseHouseholdId || !isHouseholdOperationCurrent()) return false;
    const householdId = activeSupabaseHouseholdId;
    const requestId = ++householdPeopleRequestRef.current;
    if (showLoading) {
      setHouseholdPeopleLoading(true);
      setHouseholdPeopleError("");
    }
    try {
      const [members, invites] = await Promise.all([
        listHouseholdMembers(householdId),
        listHouseholdInvites(householdId),
      ]);
      if (!isHouseholdOperationCurrent() || householdPeopleScopeRef.current !== householdId || requestId !== householdPeopleRequestRef.current) return false;
      setHouseholdMembers(members);
      setHouseholdInvites(invites);
      setHouseholdPeopleError("");
      return true;
    } catch {
      if (isHouseholdOperationCurrent() && householdPeopleScopeRef.current === householdId && requestId === householdPeopleRequestRef.current) {
        setHouseholdPeopleError(t("household.peopleLoadFailed"));
      }
      return false;
    } finally {
      if (isHouseholdOperationCurrent() && householdPeopleScopeRef.current === householdId && requestId === householdPeopleRequestRef.current) {
        setHouseholdPeopleLoading(false);
      }
    }
  };

  const setInviteFeedback = (message: string, tone: "error" | "info" | "success" = "info") => {
    setInviteStatusTone(tone);
    setInviteStatus(message);
  };

  const inviteDeliveryErrorKey = (code?: string) => {
    if (code === "INVITE_LINK_UNAVAILABLE") return "household.inviteLinkUnavailable";
    if (code === "EMAIL_CONFIGURATION_ERROR" || code === "EMAIL_AUTH_ERROR") return "household.inviteEmailConfigError";
    if (code === "EMAIL_SENDER_NOT_VERIFIED") return "household.inviteEmailSenderError";
    if (code === "EMAIL_RATE_LIMITED") return "household.inviteEmailRateLimited";
    return "household.inviteEmailRetryFailed";
  };

  const handleCreateInvite = async () => {
    if (!isHouseholdOperationCurrent()) return;
    if (isCreatingInvite) {
      return;
    }

    if (!auth.isAuthenticated) {
      setInviteFeedback(t("household.inviteStatusNotSignedIn"), "error");
      setOnboardingStep("welcome");
      return;
    }

    if (!activeSupabaseHouseholdId) {
      setInviteFeedback(t("household.inviteStatusNoHousehold"), "error");
      return;
    }
    if (!canInviteToHousehold) {
      setInviteFeedback(t("household.inviteStatusPermission"), "error");
      return;
    }

    const normalizedEmail = normalizeInviteEmail(inviteEmail);
    if (!isValidInviteEmail(normalizedEmail)) {
      setInviteFeedback(t("household.inviteStatusInvalidEmail"), "error");
      return;
    }

    if (householdMembers.some((member) => normalizeInviteEmail(member.email) === normalizedEmail)) {
      setInviteFeedback(t("household.peopleAlreadyMember"), "error");
      return;
    }

    if (householdInvites.some((invite) => isActiveInvite(invite) && normalizeInviteEmail(invite.inviteeEmail) === normalizedEmail)) {
      setInviteFeedback(t("household.inviteStatusDuplicate"), "error");
      return;
    }

    const feedbackGeneration = transientMessageGenerationRef.current;

    try {
      setIsCreatingInvite(true);
      setInviteStatus("");
      const invite = await createHouseholdInvite(activeSupabaseHouseholdId, normalizedEmail);
      if (!isHouseholdOperationCurrent()) return;
      if (isTransientMessageGenerationCurrent(feedbackGeneration)) {
        setInviteEmail("");
        setIsInvitePanelOpen(false);
        setHouseholdInvites((current) => [invite, ...current]);
        await refreshHouseholdPeople();
        void refreshSubscriptionState();
      }
      try {
        if (!isHouseholdOperationCurrent()) return;
        const delivery = await sendHouseholdInviteEmail(invite.id);
        if (isTransientMessageGenerationCurrent(feedbackGeneration)) {
          setInviteFeedback(delivery.emailSent
            ? t("household.invitationSent", { email: normalizedEmail })
            : t(inviteDeliveryErrorKey(delivery.errorCode)), delivery.emailSent ? "success" : "error");
        }
      } catch {
        if (isTransientMessageGenerationCurrent(feedbackGeneration)) {
          setInviteFeedback(t("household.inviteEmailRetryFailed"), "error");
        }
      }
    } catch (error) {
      if (!isHouseholdOperationCurrent()) return;
      if (isTransientMessageGenerationCurrent(feedbackGeneration)) {
        const debugMessage = safeInviteDebugMessage(error);
        setInviteFeedback(`${t(inviteErrorMessage(error))}${debugMessage ? ` (${debugMessage})` : ""}`, "error");
      }
      void refreshSubscriptionState();
      void refreshHouseholdPeople();
    } finally {
      if (isHouseholdOperationCurrent()) setIsCreatingInvite(false);
    }
  };

  const handleCopyInviteLink = async (item: HouseholdPersonItem) => {
    if (!isHouseholdOperationCurrent()) return;
    if (!item.inviteId || item.status !== "pending" || !householdPermissions.canRemoveMembers) return;
    const feedbackGeneration = transientMessageGenerationRef.current;
    try {
      const token = await getHouseholdInviteToken(item.inviteId);
      if (!isHouseholdOperationCurrent()) return;
      const link = createInviteUrl(token);
      await navigator.clipboard.writeText(link);
      if (isTransientMessageGenerationCurrent(feedbackGeneration)) {
        setInviteFeedback(t("household.inviteCopied"), "success");
      }
    } catch (error) {
      if (isTransientMessageGenerationCurrent(feedbackGeneration)) {
        const oldInvite = error instanceof Error && error.message.includes("Invite link cannot be recovered");
        setInviteFeedback(t(oldInvite ? "household.inviteLinkUnavailable" : "household.inviteEmailRetryFailed"), "error");
      }
    }
  };

  const handleRetryInviteEmail = async (item: HouseholdPersonItem) => {
    if (!isHouseholdOperationCurrent()) return;
    if (!item.inviteId || item.status !== "pending" || !householdPermissions.canRemoveMembers || sendingInviteId) return;
    const feedbackGeneration = transientMessageGenerationRef.current;
    setSendingInviteId(item.inviteId);
    try {
      const delivery = await sendHouseholdInviteEmail(item.inviteId);
      if (isTransientMessageGenerationCurrent(feedbackGeneration)) {
        setInviteFeedback(delivery.emailSent
          ? t("household.invitationSent", { email: item.email })
          : t(inviteDeliveryErrorKey(delivery.errorCode)), delivery.emailSent ? "success" : "error");
      }
    } catch {
      if (isTransientMessageGenerationCurrent(feedbackGeneration)) {
        setInviteFeedback(t("household.inviteEmailRetryFailed"), "error");
      }
    } finally {
      if (isHouseholdOperationCurrent()) setSendingInviteId(null);
    }
  };

  const handleRemoveHouseholdPerson = async (item: HouseholdPersonItem) => {
    if (!isHouseholdOperationCurrent()) return;
    if (!activeSupabaseHouseholdId || removingPersonKeysRef.current.has(item.key)) return;
    const householdId = activeSupabaseHouseholdId;
    if (!householdPermissions.canRemoveMembers) return;
    if (item.status !== "pending" && (!item.userId || item.role === "owner" || item.userId === auth.user?.id)) return;
    if (item.status === "pending" && !item.inviteId) return;

    removingPersonKeysRef.current.add(item.key);
    setRemovingPersonKeys(new Set(removingPersonKeysRef.current));
    const feedbackGeneration = transientMessageGenerationRef.current;
    try {
      if (item.status === "pending") await revokeHouseholdInvite(item.inviteId!);
      else await removeHouseholdMember(householdId, item.userId!);

      if (item.status === "pending") window.dispatchEvent(new Event(householdInvitationsChangedEvent));

      if (!isHouseholdOperationCurrent() || householdPeopleScopeRef.current !== householdId) return;
      setHouseholdPeopleError("");
      if (item.status === "pending") setHouseholdInvites((current) => current.filter((invite) => invite.id !== item.inviteId));
      else setHouseholdMembers((current) => current.filter((member) => member.userId !== item.userId));
      if (isTransientMessageGenerationCurrent(feedbackGeneration)) {
        setInviteFeedback(item.status === "pending" ? t("household.inviteRevoked") : t("household.peopleRemoved", { email: item.email }), "success");
      }
      void refreshHouseholdPeople();
      void refreshSubscriptionState();
    } catch {
      if (isHouseholdOperationCurrent() && householdPeopleScopeRef.current === householdId) {
        if (isTransientMessageGenerationCurrent(feedbackGeneration)) setInviteFeedback(t("household.peopleRemoveFailed"), "error");
        void refreshHouseholdPeople();
      }
    } finally {
      if (isHouseholdOperationCurrent()) {
        removingPersonKeysRef.current.delete(item.key);
        setRemovingPersonKeys(new Set(removingPersonKeysRef.current));
      }
    }
  };
  return { refreshHouseholdPeople, setInviteFeedback, inviteDeliveryErrorKey, handleCreateInvite, handleCopyInviteLink, handleRetryInviteEmail, handleRemoveHouseholdPerson };
};
