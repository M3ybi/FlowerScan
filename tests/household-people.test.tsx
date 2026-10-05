import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildHouseholdPeople, paginateHouseholdPeople } from "../src/app/householdPeople";
import { HouseholdPeopleList } from "../src/components/HouseholdPeopleList";
import { createTranslator } from "../src/lib/i18n";
import type { HouseholdInvite, HouseholdMember } from "../src/lib/plantieRepository";

const member = (userId: string, email: string, role: HouseholdMember["role"] = "viewer", householdId = "home"): HouseholdMember => ({
  createdAt: "2026-09-18T10:00:00Z", email, householdId, role, userId,
});
const invite = (id: string, email: string, changes: Partial<HouseholdInvite> = {}): HouseholdInvite => ({
  createdAt: "2026-10-03T10:00:00Z", createdBy: "owner", householdId: "home", id,
  inviteeEmail: email, role: "viewer", revokedAt: null, usedAt: null, ...changes,
});
const renderList = (items: ReturnType<typeof buildHouseholdPeople>, currentRole: HouseholdMember["role"] = "owner") => renderToStaticMarkup(createElement(HouseholdPeopleList, {
  items, loading: false, error: "", currentUserId: "owner", currentRole,
  removingKeys: new Set<string>(), language: "en", t: createTranslator("en"),
  onRemove: () => undefined, onRetry: () => undefined,
}));

test("one to four people fit on one page; larger lists show exactly four and clamp after deletion", () => {
  const four = buildHouseholdPeople("home", [1, 2, 3, 4].map((number) => member(String(number), `person${number}@example.com`)), []);
  assert.equal(paginateHouseholdPeople(four, 0).items.length, 4);
  assert.equal(paginateHouseholdPeople(four, 0).totalPages, 1);
  assert.doesNotMatch(renderList(four), /Member list pages/);

  const five = buildHouseholdPeople("home", [...four.map((item) => member(item.userId!, item.email)), member("5", "person5@example.com")], []);
  assert.equal(paginateHouseholdPeople(five, 0).items.length, 4);
  assert.equal(paginateHouseholdPeople(five, 1).items.length, 1);
  assert.equal(paginateHouseholdPeople(five, 1).totalPages, 2);
  assert.equal(paginateHouseholdPeople(four, 1).page, 0);
  assert.match(renderList(five), /1 \/ 2/);
  assert.match(renderList(five), /Previous page/);
  assert.match(renderList(five), /Next page/);
});

test("current members override all invitation variants for the same normalized email", () => {
  const items = buildHouseholdPeople("home", [member("owner", " Test@Email.com ", "owner")], [
    invite("pending", "test@email.com"),
    invite("used", "test@email.com", { usedAt: "2026-10-04T00:00:00Z" }),
    invite("revoked", "test@email.com", { revokedAt: "2026-10-04T00:00:00Z" }),
  ]);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0], {
    key: "member:owner", email: "test@email.com", role: "owner", status: "active",
    since: "2026-09-18T10:00:00Z", userId: "owner", inviteId: null,
  });
});

test("only valid pending invitations from the current household become rows", () => {
  const items = buildHouseholdPeople("home", [], [
    invite("pending", " Viewer@Example.com ", { role: "viewer" }),
    invite("duplicate", "viewer@example.com"),
    invite("used", "used@example.com", { usedAt: "2026-10-04T00:00:00Z" }),
    invite("revoked", "revoked@example.com", { revokedAt: "2026-10-04T00:00:00Z" }),
    invite("elsewhere", "other@example.com", { householdId: "other" }),
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].email, "viewer@example.com");
  assert.equal(items[0].role, "viewer");
  assert.equal(items[0].since, "2026-10-03T10:00:00Z");
  assert.equal(items[0].status, "pending");
});

test("rows display state, role, membership or invitation date, and safe remove controls", () => {
  const items = buildHouseholdPeople("home", [
    member("owner", "owner@example.com", "owner"),
    member("viewer", "long.address.for.a.household.member@example.com", "viewer"),
  ], [invite("pending", "pending@example.com", { role: "viewer" })]);
  const html = renderList(items);
  assert.match(html, /Member since/);
  assert.match(html, /Invited/);
  assert.match(html, /Active/);
  assert.match(html, /Pending/);
  assert.match(html, /Remove long.address.for.a.household.member@example.com/);
  assert.match(html, /Remove pending@example.com/);
  assert.doesNotMatch(html, /Remove owner@example.com/);

  const viewerHtml = renderList(items, "viewer");
  assert.doesNotMatch(viewerHtml, /Remove long.address.for.a.household.member@example.com/);
  assert.doesNotMatch(viewerHtml, /Remove pending@example.com/);
});

test("loading and empty states are explicit", () => {
  assert.match(renderList([]), /No household members or pending invitations/);
  const loading = renderToStaticMarkup(createElement(HouseholdPeopleList, {
    items: [], loading: true, error: "", currentUserId: null, currentRole: null,
    removingKeys: new Set<string>(), language: "en", t: createTranslator("en"),
    onRemove: () => undefined, onRetry: () => undefined,
  }));
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /Loading household members/);
  assert.doesNotMatch(loading, /No household members or pending invitations/);
});

test("a pending invite is never identified as the current user", () => {
  const items = buildHouseholdPeople("home", [], [invite("pending", "guest@example.com")]);
  const html = renderToStaticMarkup(createElement(HouseholdPeopleList, {
    items, loading: false, error: "", currentUserId: null, currentRole: null,
    removingKeys: new Set<string>(), language: "en", t: createTranslator("en"),
    onRemove: () => undefined, onRetry: () => undefined,
  }));
  assert.match(html, /guest@example.com/);
  assert.doesNotMatch(html, /No other members or pending invitations/);
  assert.doesNotMatch(html, />You</);
});

test("only the affected remove control is busy and errors keep existing rows visible", () => {
  const items = buildHouseholdPeople("home", [
    member("owner", "owner@example.com", "owner"),
    member("viewer-1", "viewer-one@example.com", "viewer"),
    member("viewer", "viewer@example.com", "viewer"),
  ], []);
  const html = renderToStaticMarkup(createElement(HouseholdPeopleList, {
    items, loading: false, error: "Could not refresh members and invitations.",
    currentUserId: "owner", currentRole: "owner",
    removingKeys: new Set(["member:viewer-1"]), language: "en", t: createTranslator("en"),
    onRemove: () => undefined, onRetry: () => undefined,
  }));
  assert.match(html, /viewer-one@example.com/);
  assert.match(html, /viewer@example.com/);
  assert.match(html, /role="alert"/);
  assert.match(html, /aria-label="Remove viewer-one@example.com"[^>]*aria-busy="true"[^>]*disabled/);
  assert.match(html, /aria-label="Remove viewer@example.com"[^>]*><svg/);
});
