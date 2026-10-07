import type { HouseholdInvitation, HouseholdInvite } from "./plantieRepository.js";

export const householdInvitationsChangedEvent = "plantie-household-invitations-changed";
export const invitationValidityMs = 7 * 24 * 60 * 60 * 1000;
export const isInvitationId = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export const isValidPendingHouseholdInvite = (invite: HouseholdInvite, now = Date.now()) => {
  const expiresAt = Date.parse(invite.expiresAt ?? "");
  return (!invite.status || invite.status === "pending") && !invite.usedAt && !invite.revokedAt &&
    !invite.declinedAt && !invite.expiredAt && Number.isFinite(expiresAt) && expiresAt > now;
};

export const isActionableHouseholdInvitation = (invite: HouseholdInvitation, now = Date.now()) =>
  invite.status === "pending" && Number.isFinite(Date.parse(invite.expiresAt)) && Date.parse(invite.expiresAt) > now;

export type InvitationRecipient = { email?: string; email_confirmed_at?: string } | null;
export type InvitationReviewState = "invalid" | "expired" | "revoked" | "declined" | "unavailable" | "accepted" |
  "auth-required" | "wrong-account" | "verification-required" | "already-member" | "ready";

export const resolveInvitationReviewState = (
  invitation: HouseholdInvitation | null,
  recipient: InvitationRecipient,
  now = Date.now(),
): InvitationReviewState => {
  if (!invitation) return "invalid";
  if (invitation.status !== "pending") return invitation.status;
  if (!isActionableHouseholdInvitation(invitation, now)) return "expired";
  if (!recipient) return "auth-required";
  if (recipient.email?.trim().toLowerCase() !== invitation.invitedEmail.trim().toLowerCase()) return "wrong-account";
  if (!recipient.email_confirmed_at) return "verification-required";
  if (invitation.isMember) return "already-member";
  return "ready";
};

export const notifyHouseholdInvitationsChanged = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(householdInvitationsChangedEvent));
};

// Adding a membership never changes a valid selection. Selecting a first household is the only fallback.
export const householdSelectionAfterInvitation = (
  currentHouseholdId: string | null,
  activeHouseholdIds: readonly string[],
  joinedHouseholdId: string,
) => currentHouseholdId && activeHouseholdIds.includes(currentHouseholdId)
  ? currentHouseholdId : activeHouseholdIds[0] ?? joinedHouseholdId;
