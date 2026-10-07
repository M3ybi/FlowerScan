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
import { householdInvitationCopy } from "../src/lib/householdInvitationCopy";
import { installInvitationOverlayInteractions, invitationPopoverPosition } from "../src/lib/invitationOverlay";

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

test("concurrent route and mailbox reviews name their own headings without duplicate IDs", () => {
  const reviewProps: Parameters<typeof HouseholdInvitationReview>[0] = {
    invitation: invitation(), user: verifiedUser, language: "en", loading: false, error: false, accepting: false, declining: false,
    onAccept: () => undefined, onDecline: () => undefined, onUseAnotherAccount: () => undefined, onCancel: () => undefined,
    onStay: () => undefined, onSwitch: () => undefined, onRetry: () => undefined,
  };
  const html = renderToStaticMarkup(createElement("div", null,
    createElement(HouseholdInvitationReview, { ...reviewProps, key: "route" }),
    createElement(HouseholdInvitationReview, { ...reviewProps, key: "mailbox" }),
    createElement(HouseholdInvitationReview, { ...reviewProps, key: "route-success", acceptedHousehold: { id: "route", name: "Route family" } }),
    createElement(HouseholdInvitationReview, { ...reviewProps, key: "mailbox-success", acceptedHousehold: { id: "mailbox", name: "Mailbox family" } }),
  ));
  const labelIds = Array.from(html.matchAll(/aria-labelledby="([^"]+)"/g), (match) => match[1]);
  const headingIds = Array.from(html.matchAll(/<h2 id="([^"]+)"/g), (match) => match[1]);
  assert.equal(labelIds.length, 4);
  assert.equal(new Set(labelIds).size, 4, "every rendered review has a unique accessible heading");
  assert.deepEqual(labelIds, headingIds, "each review references its own heading");
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

test("mailbox stays interactive when empty and caps only the visible badge at 9+", () => {
  const renderButton = (count: number, language: "en" | "sk" = "en") => renderToStaticMarkup(createElement(InvitationInboxButton, { count, loading: false, expanded: true, language, onClick: () => undefined }));
  assert.match(renderButton(0), /<button[^>]*type="button"[^>]*aria-label="Household invitations"/);
  assert.match(renderButton(0), /aria-haspopup="dialog"[^>]*aria-controls="household-invitation-center"/);
  assert.doesNotMatch(renderButton(0), /disabled|invitation-inbox-badge/);
  assert.match(renderButton(1), /aria-label="Household invitations, 1 pending"/);
  assert.match(renderButton(12), /aria-label="Household invitations, 12 pending"/);
  assert.match(renderButton(12), /invitation-inbox-badge[^>]*>9\+</);
  assert.match(renderButton(12, "sk"), /počet čakajúcich: 12/);
  assert.doesNotMatch(renderButton(Number.NaN), /invitation-inbox-badge/);
});

test("inbox distinguishes skeleton, empty and retryable error without leaking stale cards", () => {
  const renderInbox = (changes: Partial<Parameters<typeof HouseholdInvitationInbox>[0]> = {}) => renderToStaticMarkup(createElement(HouseholdInvitationInbox, {
    invitations: [], language: "en", loading: false, error: false, onView: () => undefined, onClose: () => undefined, onRetry: () => undefined, ...changes,
  }));
  const loading = renderInbox({ loading: true });
  assert.equal((loading.match(/class="invitation-inbox-skeleton"/g) ?? []).length, 2);
  assert.match(loading, /role="status" aria-label="Loading invitation/);
  assert.doesNotMatch(loading, /no pending household invitations/);
  const empty = renderInbox();
  assert.match(empty, /no pending household invitations/);
  assert.match(empty, /When someone invites you to a household/);
  const failed = renderInbox({ error: true, invitations: [invitation()] });
  assert.match(failed, /role="alert"/);
  assert.match(failed, />Retry</);
  assert.doesNotMatch(failed, /no pending household invitations|owner@example.com|>View invitation</);
  const card = renderInbox({ invitations: [invitation({ householdName: "<script>bad</script>" })] });
  assert.match(card, /&lt;script&gt;bad&lt;\/script&gt;/);
  assert.match(card, /invitation-inbox-pending[^>]*>Pending</);
  assert.doesNotMatch(card, /11111111-1111-4111-8111-111111111111|<script>/);
});

test("all supported languages provide mailbox counts and dialog controls", () => {
  for (const language of ["en", "sk", "de", "fr", "es"] as const) {
    const copy = householdInvitationCopy(language);
    assert.match(copy.pendingCount(24), /24/);
    assert.ok(copy.close.length && copy.backToInbox.length && copy.inboxEmptyHint.length);
    assert.doesNotMatch(copy.pendingCount(24), /9\+/);
  }
});

test("desktop positioning remains anchored and clamps narrow or short viewports", () => {
  assert.deepEqual(invitationPopoverPosition({ left: 850, right: 900, top: 80, bottom: 128 }, { width: 440, height: 300 }, { width: 1200, height: 900 }), { left: 460, top: 140, maxHeight: 868 });
  const above = invitationPopoverPosition({ left: 850, right: 900, top: 700, bottom: 748 }, { width: 440, height: 300 }, { width: 1200, height: 800 });
  assert.equal(above.top, 388);
  const cramped = invitationPopoverPosition({ left: 1, right: 30, top: 10, bottom: 30 }, { width: 288, height: 700 }, { width: 320, height: 500 });
  assert.deepEqual(cramped, { left: 16, top: 16, maxHeight: 468 });
});

test("overlay handles outside pointer, Escape, keyboard focus and pending dismissal at the DOM boundary", () => {
  const documentBoundary = Object.assign(new EventTarget(), { activeElement: null as HTMLElement | null });
  const makeElement = () => {
    const contained = new Set<Node>();
    const element = {
      ownerDocument: documentBoundary, tabIndex: 0, isConnected: true,
      contains: (target: Node) => target === element as unknown as Node || contained.has(target),
      focus: () => { documentBoundary.activeElement = element as unknown as HTMLElement; },
      querySelectorAll: () => [] as HTMLElement[], getClientRects: () => [{}], matches: () => false, closest: () => null,
    };
    return { element: element as unknown as HTMLElement, contained };
  };
  const anchor = makeElement().element;
  const dialogBoundary = makeElement();
  const first = makeElement().element;
  const last = makeElement().element;
  const outside = makeElement().element;
  dialogBoundary.contained.add(first);
  dialogBoundary.contained.add(last);
  dialogBoundary.element.querySelectorAll = (() => [first, last]) as unknown as typeof dialogBoundary.element.querySelectorAll;
  const dispatch = (type: string, target: HTMLElement, properties: Record<string, unknown> = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, "target", { value: target });
    Object.assign(event, properties);
    documentBoundary.dispatchEvent(event);
    return event;
  };
  let closes = 0;
  let busy = false;
  anchor.focus();
  const dispose = installInvitationOverlayInteractions({ dialog: dialogBoundary.element, anchor, onClose: () => { closes += 1; }, isBusy: () => busy });
  assert.equal(documentBoundary.activeElement, dialogBoundary.element);
  dispatch("pointerdown", anchor);
  dispatch("pointerdown", first);
  assert.equal(closes, 0, "the opening anchor and dialog contents do not dismiss");
  dispatch("pointerdown", outside);
  assert.equal(closes, 1);
  busy = true;
  dispatch("pointerdown", outside);
  assert.equal(dispatch("keydown", dialogBoundary.element, { key: "Escape" }).defaultPrevented, true);
  assert.equal(closes, 1, "pending backend mutations cannot be dismissed");
  busy = false;
  dispatch("keydown", dialogBoundary.element, { key: "Escape" });
  assert.equal(closes, 2);
  first.focus();
  dispatch("keydown", first, { key: "Tab", shiftKey: true });
  assert.equal(documentBoundary.activeElement, last);
  dispatch("keydown", last, { key: "Tab", shiftKey: false });
  assert.equal(documentBoundary.activeElement, first);
  outside.focus();
  dispatch("focusin", outside);
  assert.equal(documentBoundary.activeElement, dialogBoundary.element);
  dispose();
  assert.equal(documentBoundary.activeElement, anchor);
  dispatch("pointerdown", outside);
  dispatch("keydown", outside, { key: "Escape" });
  assert.equal(closes, 2, "all document listeners are removed on close");
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
