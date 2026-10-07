import assert from "node:assert/strict";
import test from "node:test";
import {
  createInviteUrl,
  createSingleFlightInviteJoin,
  inviteErrorMessage,
  isLikelyInviteToken,
  joinInviteErrorMessage,
  normalizeInviteTokenInput,
  safeInviteDebugMessage,
} from "../src/app/householdInvites.js";
import { areStringRecordsEqual, mergeCloudRecords } from "../src/app/records.js";
import { isRouteAllowedWithoutHousehold, parseHashRoute } from "../src/app/routes.js";
import type { FlowerRecords } from "../src/hooks/useFlowerRecords.js";
import { householdAfterInviteAcceptance, readSelectedHouseholdId, resolveHouseholdSelection, writeSelectedHouseholdId } from "../src/lib/householdSelection.js";
import type { Household } from "../src/lib/plantieRepository.js";

test("invite helper normalizes raw tokens and copied invite URLs", () => {
  const token = "abc1234567890_DEF-abc1234567890_DEF";

  assert.equal(normalizeInviteTokenInput(`  ${token}  `), token);
  assert.equal(normalizeInviteTokenInput(`https://plantie.example/#/join?invite=${token}`), token);
  assert.equal(normalizeInviteTokenInput(`#/join?invite=${token}`), token);
  assert.equal(createInviteUrl(token, "https://plantie.example/app?old=1#/menu"), `https://plantie.example/app#/join?invite=${token}`);
  assert.equal(isLikelyInviteToken(token), true);
  assert.equal(isLikelyInviteToken("short-token"), false);
});

test("invite helper maps backend errors to safe localization keys", () => {
  assert.equal(inviteErrorMessage({ message: "An active invite already exists for this email." }), "household.inviteStatusDuplicate");
  assert.equal(inviteErrorMessage({ code: "42501", message: "permission denied" }), "household.inviteStatusPermission");
  assert.equal(joinInviteErrorMessage({ message: "Invite is already used." }), "household.inviteStatusInvalidInvite");
  assert.equal(safeInviteDebugMessage({ code: "PGRST202", message: "schema cache miss" }, true), "");
  assert.equal(
    safeInviteDebugMessage({ code: "PGRST202", message: "schema cache miss" }, false),
    "PGRST202 | schema cache miss",
  );
});

test("concurrent invite acceptance runs once and allows a later retry", async () => {
  const joinOnce = createSingleFlightInviteJoin();
  let attempts = 0;
  let resolveFirst!: (value: boolean) => void;
  const first = joinOnce(() => {
    attempts += 1;
    return new Promise<boolean>((resolve) => { resolveFirst = resolve; });
  });
  const duplicate = joinOnce(async () => {
    attempts += 1;
    return false;
  });

  assert.equal(await duplicate, undefined);
  assert.equal(attempts, 1);
  resolveFirst(true);
  assert.equal(await first, true);
  assert.equal(await joinOnce(async () => {
    attempts += 1;
    return false;
  }), false);
  assert.equal(attempts, 2);

  await assert.rejects(joinOnce(async () => { throw new Error("network failure"); }), /network failure/);
  assert.equal(await joinOnce(async () => true), true);
});

test("route helper parses public and protected app routes", () => {
  assert.deepEqual(parseHashRoute("#/flower/monstera?scan=1"), { flowerId: "monstera", page: "detail", panel: "", scan: true });
  assert.deepEqual(parseHashRoute("#/flower/monstera?panel=diagnostics"), {
    flowerId: "monstera",
    page: "detail",
    panel: "diagnostics",
    scan: false,
  });
  assert.deepEqual(parseHashRoute("#/menu?section=household"), { page: "menu", section: "household" });
  assert.deepEqual(parseHashRoute("#/privacy"), { legalPageId: "privacy", page: "legal" });

  assert.equal(isRouteAllowedWithoutHousehold({ page: "menu", section: "" }), true);
  assert.equal(isRouteAllowedWithoutHousehold({ page: "legal", legalPageId: "terms" }), true);
  assert.equal(isRouteAllowedWithoutHousehold({ page: "dashboard" }), false);
});

test("accepting an invite preserves the selected household and selection stays account-scoped", () => {
  const firstUser = "11111111-1111-4111-8111-111111111111";
  const secondUser = "22222222-2222-4222-8222-222222222222";
  const personal = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Personal", legacyPublicToken: null } as Household;
  const joined = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Family", legacyPublicToken: null } as Household;
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  writeSelectedHouseholdId(storage, firstUser, personal.id);
  writeSelectedHouseholdId(storage, secondUser, joined.id);

  assert.equal(householdAfterInviteAcceptance(personal, joined), personal);
  assert.equal(householdAfterInviteAcceptance(null, joined), joined);
  assert.equal(resolveHouseholdSelection([personal, joined], readSelectedHouseholdId(storage, firstUser)), personal);
  assert.equal(resolveHouseholdSelection([personal, joined], readSelectedHouseholdId(storage, secondUser)), joined);
  assert.equal(resolveHouseholdSelection([personal], joined.id), personal);
  assert.equal(readSelectedHouseholdId({ getItem: () => "invalid JSON" }, firstUser), null);
});

test("record helper prefers non-empty cloud records without discarding local-only records", () => {
  const localRecords: FlowerRecords = {
    a: { lastFertilized: "", lastTransplanted: "", lastWatered: "2026-09-01", note: "local" },
    b: { lastFertilized: "", lastTransplanted: "", lastWatered: "", note: "kept local" },
  };
  const cloudRecords: FlowerRecords = {
    a: { lastFertilized: "", lastTransplanted: "", lastWatered: "2026-09-02", note: "cloud" },
    b: { lastFertilized: "", lastTransplanted: "", lastWatered: "", note: "" },
  };

  assert.deepEqual(mergeCloudRecords(localRecords, cloudRecords), {
    a: cloudRecords.a,
    b: localRecords.b,
  });
  assert.equal(areStringRecordsEqual({ a: "1", b: "2" }, { b: "2", a: "1" }), true);
  assert.equal(areStringRecordsEqual({ a: "1" }, { a: "1", b: "2" }), false);
});
