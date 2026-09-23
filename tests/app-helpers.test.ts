import assert from "node:assert/strict";
import test from "node:test";
import {
  createInviteUrl,
  inviteErrorMessage,
  isLikelyInviteToken,
  joinInviteErrorMessage,
  normalizeInviteTokenInput,
  safeInviteDebugMessage,
} from "../src/app/householdInvites.js";
import { areStringRecordsEqual, mergeCloudRecords } from "../src/app/records.js";
import { isRouteAllowedWithoutHousehold, parseHashRoute } from "../src/app/routes.js";
import type { FlowerRecords } from "../src/hooks/useFlowerRecords.js";

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
