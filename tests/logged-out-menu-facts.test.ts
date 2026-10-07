import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import packageInfo from "../package.json";
import { parseHashRoute, isRouteAllowedWithoutHousehold } from "../src/app/routes";
import { readAppVersion } from "../src/hooks/useAppVersion";
import { HOUSEHOLD_LIMITS } from "../src/lib/householdMembershipRules";
import { resolveHouseholdPermissions } from "../src/lib/householdPermissions";
import { freeQrLabelLimit, PLAN_LIMITS } from "../src/lib/householdPlanRules";
import { invitationValidityMs } from "../src/lib/householdInvitationRules";
import { loggedOutMenuCopy } from "../src/lib/loggedOutMenuCopy";
import { menuProductInfo } from "../src/lib/menuProductInfo";
import { supportedLanguages, writeStoredLanguage, readStoredLanguage } from "../src/lib/onboarding";

test("public plan and capacity facts follow canonical product limits", () => {
  assert.deepEqual(menuProductInfo.limits.free, {
    plants: PLAN_LIMITS.free.maxPlants,
    scans: PLAN_LIMITS.free.monthlyPlantUnwellAiAnalyzes,
    qr: freeQrLabelLimit,
    careRefreshes: PLAN_LIMITS.free.careTipRefreshPerPlantPerDay,
    slots: HOUSEHOLD_LIMITS.free.maxMembers,
  });
  assert.equal(menuProductInfo.limits.premium.slots, HOUSEHOLD_LIMITS.premium.maxMembers);
  assert.equal(HOUSEHOLD_LIMITS.free.invitationsEnabled, false);
  assert.equal(HOUSEHOLD_LIMITS.premium.invitationsEnabled, true);
  assert.equal(PLAN_LIMITS.premium.maxPlants, null);
  assert.equal(PLAN_LIMITS.premium.monthlyPlantUnwellAiAnalyzes, null);
  assert.equal(PLAN_LIMITS.premium.careTipRefreshPerPlantPerDay, null);
  assert.equal(PLAN_LIMITS.free.initialCareGenerationCountsAsAnalyze, false);
  assert.match(readFileSync("src/App.tsx", "utf8"), /!subscription\.householdEntitlement\.isPremium && allFlowers\.length > freeQrLabelLimit/);
});

test("published destinations are existing routes available without a household", () => {
  const expected = { support: "support", privacy: "privacy", terms: "terms", subscriptionTerms: "subscription-terms" };
  for (const [key, id] of Object.entries(expected)) {
    const route = parseHashRoute(menuProductInfo.routes[key as keyof typeof menuProductInfo.routes]);
    assert.deepEqual(route, { page: "legal", legalPageId: id });
    assert.equal(isRouteAllowedWithoutHousehold(route), true);
  }
  assert.deepEqual(Object.keys(menuProductInfo.routes).sort(), Object.keys(expected).sort());
});

test("all supported languages provide the same complete translated copy contract", () => {
  assert.equal(menuProductInfo.languages, supportedLanguages);
  assert.deepEqual(menuProductInfo.languages.map((language) => language.code), ["en", "sk", "de", "fr", "es"]);
  const english = loggedOutMenuCopy("en");
  for (const { code } of supportedLanguages) {
    const translated = loggedOutMenuCopy(code);
    assert.deepEqual(Object.keys(translated).sort(), Object.keys(english).sort());
    assert.equal(translated.householdFeatures.length, 4);
    assert.equal(translated.supportTips.length, 3);
    assert.equal(translated.aboutFeatures.length, 5);
    for (const [key, value] of Object.entries(translated)) {
      if (typeof value === "string") {
        assert.ok(value.trim(), `${code}.${key} must contain text`);
        if (code !== "en") assert.notEqual(value, english[key as keyof typeof english], `${code}.${key} must be translated`);
      } else if (typeof value === "function") {
        assert.match(value(27), /27/, `${code}.${key} must use its supplied limit`);
      } else {
        for (const item of value) {
          if (typeof item === "string") assert.ok(item.trim());
          else { assert.ok(item.title.trim()); assert.ok(item.body.trim()); }
        }
      }
    }
  }
});

test("public role descriptions reflect full Viewer care access and Owner administration", () => {
  const copy = loggedOutMenuCopy("en");
  const viewer = resolveHouseholdPermissions("viewer");
  const owner = resolveHouseholdPermissions("owner");
  assert.equal(viewer.canCreatePlants && viewer.canEditPlants && viewer.canDeletePlants && viewer.canManageCare, true);
  assert.equal(viewer.canUseDiagnostics && viewer.canUseQrFeatures, true);
  assert.equal(viewer.canEditHousehold || viewer.canInviteMembers || viewer.canRemoveMembers || viewer.canManageSubscription, false);
  assert.equal(owner.canEditHousehold && owner.canInviteMembers && owner.canRemoveMembers && owner.canManageSubscription, true);
  assert.match(copy.viewerBody, /Active Viewers can add, edit, and delete plants/);
  assert.match(copy.viewerBody, /cannot edit the household, manage members, or change billing/);
  assert.match(copy.historyBody, /active Owners and Viewers can read/);
  assert.equal(resolveHouseholdPermissions("viewer", "suspended_plan_limit").canViewPlants, false);
});

test("invitation and subscription guidance preserves recipient, capacity, and household boundaries", () => {
  const copy = loggedOutMenuCopy("en");
  assert.equal(invitationValidityMs, 7 * 24 * 60 * 60 * 1000);
  assert.match(copy.inviteExplanation, /invited email address/);
  assert.match(copy.inviteExplanation, /Verify that email/);
  assert.match(copy.inviteExplanation, /accept or decline/);
  assert.match(copy.inviteExplanation, /seven days/);
  assert.match(copy.occupiedSlotsBody, /Active members and valid pending invitations/);
  assert.match(copy.multiHouseholdBody, /keeps your existing households/);
  assert.match(copy.multiHouseholdBody, /does not upgrade your other households/);
  assert.match(copy.cancellationBody, /until the paid period ends/);
  assert.match(copy.cancellationBody, /Viewer access is suspended; shared plant data is retained/);
});

test("language preference storage works without account or network access", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  for (const { code } of supportedLanguages) {
    writeStoredLanguage(storage, code);
    assert.equal(readStoredLanguage(storage), code);
  }
  assert.match(loggedOutMenuCopy("en").languageBody, /saved on this device/);
  assert.match(loggedOutMenuCopy("en").languageBody, /previously saved plant text stays as written/);
});

test("logged-out product copy does not invent prices, contacts, notification delivery, or exclusive backup", () => {
  for (const { code } of supportedLanguages) {
    const copy = loggedOutMenuCopy(code);
    const text = JSON.stringify(copy);
    assert.doesNotMatch(text, /(?:https?:\/\/|mailto:|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\d[.,]\d{2}\s*(?:€|EUR|USD)|\$\d|live chat|24\/7)/i);
    assert.doesNotMatch(copy.aboutFeatures.join(" "), /push|email report|cloud backup/i);
    assert.ok(copy.pricesAfterSignIn);
    assert.ok(copy.supportContactPending);
  }
  assert.match(loggedOutMenuCopy("en").pricesAfterSignIn, /Sign in to load current prices/);
  assert.match(loggedOutMenuCopy("en").supportContactPending, /not configured/);
  for (const path of ["src/lib/menuProductInfo.ts", "src/lib/loggedOutMenuCopy.ts", "src/hooks/useAppVersion.ts"]) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /billingService|getAvailableProducts|fetch\(/);
  }
});

test("web version is package metadata and never calls native APIs", async () => {
  let reads = 0;
  assert.equal(menuProductInfo.version, packageInfo.version);
  assert.equal(await readAppVersion(false, async () => { reads += 1; throw new Error("native call on web"); }), packageInfo.version);
  assert.equal(reads, 0);
});

test("native version uses the installed bundle, not the web package version", async () => {
  assert.equal(await readAppVersion(true, async () => ({ version: " 2.7.4 " })), "2.7.4");
  for (const version of [null, undefined, "", "   ", 27]) {
    assert.equal(await readAppVersion(true, async () => ({ version })), null);
  }
  await assert.rejects(readAppVersion(true, async () => { throw new Error("native info unavailable"); }));
});
