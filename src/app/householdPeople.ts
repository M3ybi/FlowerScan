import type { HouseholdInvite, HouseholdMember, HouseholdRole } from "../lib/plantieRepository";
import { normalizeInviteEmail } from "../lib/plantieRepository";

export type HouseholdPersonItem = {
  key: string;
  email: string;
  role: HouseholdRole;
  status: "active" | "pending" | "suspended_plan_limit";
  since: string;
  userId: string | null;
  inviteId: string | null;
};

export const buildHouseholdPeople = (
  householdId: string,
  members: HouseholdMember[],
  invites: HouseholdInvite[],
): HouseholdPersonItem[] => {
  const byEmail = new Map<string, HouseholdPersonItem>();

  for (const member of members) {
    if (member.householdId !== householdId) continue;
    const email = normalizeInviteEmail(member.email);
    if (!email || byEmail.has(email)) continue;
    byEmail.set(email, {
      key: `member:${member.userId}`,
      email,
      role: member.role,
      status: member.status ?? "active",
      since: member.createdAt,
      userId: member.userId,
      inviteId: null,
    });
  }

  for (const invite of invites) {
    if (invite.householdId !== householdId || invite.usedAt || invite.revokedAt) continue;
    const email = normalizeInviteEmail(invite.inviteeEmail);
    if (!email || byEmail.has(email)) continue;
    byEmail.set(email, {
      key: `invite:${invite.id}`,
      email,
      role: invite.role,
      status: "pending",
      since: invite.createdAt,
      userId: null,
      inviteId: invite.id,
    });
  }

  return [...byEmail.values()].sort((left, right) =>
    Number(left.status === "pending") - Number(right.status === "pending") || left.email.localeCompare(right.email),
  );
};

export const paginateHouseholdPeople = (items: HouseholdPersonItem[], requestedPage: number, pageSize = 4) => {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(0, requestedPage), totalPages - 1);
  return { items: items.slice(page * pageSize, (page + 1) * pageSize), page, totalPages };
};
