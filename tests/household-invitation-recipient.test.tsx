import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { User } from "@supabase/supabase-js";
import { HouseholdInvitationReview } from "../src/components/HouseholdInvitationReview";
import { HouseholdInvitationInbox, InvitationInboxButton } from "../src/components/HouseholdInvitationInbox";
import { buildHouseholdPeople } from "../src/app/householdPeople";
import { householdSelectionAfterInvitation, isActionableHouseholdInvitation, isValidPendingHouseholdInvite, resolveInvitationReviewState } from "../src/lib/householdInvitationRules";
import { clearInvitationAuthContext, invitationAuthContextStorageKey, invitationReturnLocation, readInvitationAuthContext, rememberInvitationAuthContext } from "../src/lib/invitationAuthContext";
import { readWebAuthCallback, resolveAuthCallbackReturnLocation } from "../src/lib/authRedirects";
import { parseHashRoute } from "../src/app/routes";
import type { HouseholdInvitation, HouseholdInvite } from "../src/lib/plantieRepository";
import { loadInvitationReview } from "../src/hooks/useHouseholdInvitations";

const invitationId = "11111111-1111-4111-8111-111111111111";
const invitation = (changes: Partial<HouseholdInvitation> = {}): HouseholdInvitation => ({
  id: invitationId, householdId: "family", householdName: "Family", invitedEmail: "guest@example.com", inviterEmail: "owner@example.com", role: "viewer",
  status: "pending", expiresAt: "2099-10-14T10:00:00Z", activeMemberCount: 2, maxSlots: 3, isMember: false, ...changes,
});
const verifiedUser = { id: "guest", email: "guest@example.com", email_confirmed_at: "2026-10-07T10:00:00Z" } as User;
const renderReview = (changes: Partial<Parameters<typeof HouseholdInvitationReview>[0]> = {}) => renderToStaticMarkup(createElement(HouseholdInvitationReview, {
  invitation: invitation(), user: verifiedUser, language: "en", loading: false, error: false, accepting: false, declining: false,
  onAccept: () => undefined, onDecline: () => undefined, onUseAnotherAccount: () => undefined, onCancel: () => undefined,
  onStay: () => undefined, onSwitch: () => undefined, onRetry: () => undefined, ...changes,
}));
const memoryStorage = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
};

test("verified matching password or Google identity can review; wrong and unverified identities cannot accept", () => {
  assert.equal(resolveInvitationReviewState(invitation(), null), "auth-required");
  assert.equal(resolveInvitationReviewState(invitation(), { email: " GUEST@EXAMPLE.COM ", email_confirmed_at: "verified" }), "ready");
  assert.equal(resolveInvitationReviewState(invitation(), { email: "other@example.com", email_confirmed_at: "verified" }), "wrong-account");
  assert.equal(resolveInvitationReviewState(invitation(), { email: "guest@example.com" }), "verification-required");
  assert.equal(resolveInvitationReviewState(invitation({ isMember: true }), verifiedUser), "already-member");
  const wrongAccountHtml = renderReview({ user: { ...verifiedUser, email: "other@example.com" } });
  assert.match(wrongAccountHtml, /guest@example.com.*other@example.com/);
  assert.match(wrongAccountHtml, /Use another account/);
  assert.doesNotMatch(wrongAccountHtml, />Join household</);
  assert.doesNotMatch(renderReview({ user: { ...verifiedUser, email_confirmed_at: undefined } }), />Join household</);
});

test("review shows membership scope and requires an explicit accept control", () => {
  const html = renderReview();
  assert.match(html, /Your existing household will not be removed or changed/);
  assert.match(html, /adds another household to your account/);
  assert.match(html, /Add and manage plants/);
  assert.match(html, /2 \/ 3/);
  assert.match(html, />Join household</);
  assert.match(html, />Decline invitation</);
  assert.doesNotMatch(html, /Invite token|type="text"/);
  const registering = renderReview({ user: null });
  assert.match(registering, /readonly=""[^>]*value="guest@example.com"/);
  assert.match(registering, /review and accept this invitation/);
  assert.doesNotMatch(registering, />Join household</);
});

test("recipient lookup failures allow safe account correction without revealing invitation details", () => {
  const html = renderReview({ invitation: null, error: true, actionError: "Sign-out could not be completed. Try again." });
  assert.match(html, /Use another account/);
  assert.match(html, />Retry</);
  assert.match(html, />Cancel</);
  assert.match(html, /Sign-out could not be completed/);
  assert.doesNotMatch(html, /guest@example.com|owner@example.com|Family|>Join household</);
  assert.match(renderReview({ user: { ...verifiedUser, email: "other@example.com" }, actionError: "Sign-out failed." }), /Sign-out failed/);
});

test("private ID-only lookup returning no row enables account correction; an unknown token remains invalid", async () => {
  const requests: Array<{ token?: string; invitationId?: string }> = [];
  const noAuthorizedRow = async (request: { token?: string; invitationId?: string }) => {
    requests.push(request);
    return null;
  };
  const unrelatedAccount = await loadInvitationReview({ invitationId }, noAuthorizedRow);
  assert.deepEqual(unrelatedAccount, { invitation: null, error: true });
  const html = renderReview(unrelatedAccount);
  assert.match(html, /Use another account/);
  assert.match(html, />Cancel</);
  assert.doesNotMatch(html, /guest@example.com|owner@example.com|>Join household</);

  const tokenLookup = await loadInvitationReview({ token: "missing-invitation-token" }, noAuthorizedRow);
  assert.deepEqual(tokenLookup, { invitation: null, error: false });
  assert.doesNotMatch(renderReview(tokenLookup), /Use another account|>Join household</);
  assert.deepEqual(requests, [{ invitationId }, { token: "missing-invitation-token" }]);

  const matchingInvitation = invitation();
  assert.deepEqual(await loadInvitationReview({ invitationId }, async () => matchingInvitation), { invitation: matchingInvitation, error: false });
});

test("joined screen offers stay and explicit switch while preventing accidental resubmission", () => {
  const html = renderReview({ acceptedHousehold: { id: "family", name: "Family" } });
  assert.match(html, /Your existing household has not changed/);
  assert.match(html, /Stay in current household/);
  assert.match(html, /Switch to Family/);
  assert.doesNotMatch(html, />Join household</);
  const busy = renderReview({ accepting: true });
  assert.match(busy, /Joining household/);
  assert.match(busy, /disabled/);
});

test("adding an invited membership preserves the current household and its independent scope", () => {
  const householdIds = ["original", "family"];
  assert.equal(householdSelectionAfterInvitation("original", householdIds, "family"), "original");
  assert.equal(householdSelectionAfterInvitation(null, [], "family"), "family");
  assert.equal(householdSelectionAfterInvitation(null, ["original", "family"], "family"), "original");
  assert.deepEqual(householdIds, ["original", "family"]);
});

test("expiry is excluded at the exact boundary and all historical invitation statuses are nonactionable", () => {
  const expiresAt = "2026-10-14T10:00:00Z";
  const before = Date.parse(expiresAt) - 1;
  assert.equal(isActionableHouseholdInvitation(invitation({ expiresAt }), before), true);
  assert.equal(isActionableHouseholdInvitation(invitation({ expiresAt }), before + 1), false);
  assert.equal(resolveInvitationReviewState(invitation({ expiresAt }), verifiedUser, before + 1), "expired");
  for (const status of ["accepted", "declined", "revoked", "expired", "unavailable"] as const) {
    assert.equal(isActionableHouseholdInvitation(invitation({ status }), before), false);
    assert.equal(resolveInvitationReviewState(invitation({ status }), verifiedUser, before), status);
  }
  assert.equal(isActionableHouseholdInvitation(invitation({ expiresAt: "malformed" }), before), false);
  assert.match(renderReview({ invitation: invitation({ status: "expired" }) }), /has expired/);
  assert.doesNotMatch(renderReview({ invitation: invitation({ status: "revoked" }) }), />Join household</);
});

test("owner list includes active members and valid pending invitations only", () => {
  const pending: HouseholdInvite = { id: "pending", householdId: "family", inviteeEmail: " Guest@Example.com ", role: "viewer", createdBy: "owner", createdAt: "2026-10-07T10:00:00Z", expiresAt: "2026-10-14T10:00:00Z", usedAt: null, revokedAt: null };
  const now = Date.parse("2026-10-07T10:00:00Z");
  assert.equal(isValidPendingHouseholdInvite(pending, now), true);
  assert.equal(isValidPendingHouseholdInvite({ ...pending, expiresAt: undefined }, now), false);
  const items = buildHouseholdPeople("family", [
    { createdAt: pending.createdAt, email: "owner@example.com", householdId: "family", role: "owner", status: "active", userId: "owner" },
    { createdAt: pending.createdAt, email: "suspended@example.com", householdId: "family", role: "viewer", status: "suspended_plan_limit", userId: "suspended" },
  ], [pending, { ...pending, id: "expired", inviteeEmail: "old@example.com", expiresAt: "2026-10-07T10:00:00Z" }, { ...pending, id: "declined", inviteeEmail: "declined@example.com", declinedAt: pending.createdAt }], now);
  assert.equal(items.length, 2);
  assert.equal(items.filter((item) => item.status === "pending").length, 1);
  assert.equal(items[1].email, "guest@example.com");
});

test("inbox rows and mail badge display only actionable pending invitations", () => {
  const html = renderToStaticMarkup(createElement(HouseholdInvitationInbox, { invitations: [invitation(), invitation({ id: "expired", status: "expired", householdName: "Expired family" }), invitation({ id: "revoked", status: "revoked", householdName: "Revoked family" })], language: "en", loading: false, error: false, onView: () => undefined, onClose: () => undefined, onRetry: () => undefined }));
  assert.match(html, /Family/);
  assert.match(html, /owner@example.com/);
  assert.match(html, /View invitation/);
  assert.doesNotMatch(html, /Expired family|Revoked family/);
  assert.match(renderToStaticMarkup(createElement(InvitationInboxButton, { count: 2, loading: false, expanded: false, language: "en", onClick: () => undefined })), /invitation-inbox-badge[^>]*>2</);
  assert.doesNotMatch(renderToStaticMarkup(createElement(InvitationInboxButton, { count: 0, loading: false, expanded: false, language: "en", onClick: () => undefined })), /invitation-inbox-badge/);
});

test("registration context survives tabs with an ID and expires without retaining raw tokens", () => {
  const storage = memoryStorage();
  const now = Date.parse("2026-10-07T10:00:00Z");
  rememberInvitationAuthContext(invitationId, storage, now);
  assert.equal(readInvitationAuthContext(storage, now + 1), invitationId);
  assert.equal(invitationReturnLocation(invitationId), `/#/join?invitation=${invitationId}`);
  assert.deepEqual(parseHashRoute(`#/join?invitation=${invitationId}`), { page: "join", invite: "", invitationId });
  assert.equal(readWebAuthCallback(`https://plantie.example/auth/callback?code=code&invitation=${invitationId}`)?.invitationId, invitationId);
  assert.equal(readWebAuthCallback("https://plantie.example/auth/callback?code=code&invitation=invalid")?.invitationId, undefined);
  assert.equal(resolveAuthCallbackReturnLocation("/#/menu", invitationId, null), `/#/join?invitation=${invitationId}`);
  assert.equal(resolveAuthCallbackReturnLocation("/#/join?invite=original", invitationId, invitationId), "/#/join?invite=original");
  assert.equal(readInvitationAuthContext(storage, now + 7 * 24 * 60 * 60 * 1000), null);
  assert.equal(storage.getItem(invitationAuthContextStorageKey), null);
  rememberInvitationAuthContext("https://evil.example", storage, now);
  assert.equal(storage.getItem(invitationAuthContextStorageKey), null);
  storage.setItem(invitationAuthContextStorageKey, "broken-json");
  assert.equal(readInvitationAuthContext(storage, now), null);
  clearInvitationAuthContext(storage);
});
