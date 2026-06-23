import assert from "node:assert/strict";
import test from "node:test";
import { resolveAiDiagnosisAccess } from "../src/lib/aiDiagnosisAccess.js";
import { resolveDiagnosisGate } from "../src/lib/diagnosisGateRules.js";
import { normalizeReminderSettings } from "../src/lib/reminderService.js";
import {
  maxDiagnosticImageBytes,
  sanitizeDiagnosticEntries,
  sanitizeDiagnosticNote,
  validateDiagnosticImageFile,
} from "../src/utils/diagnostics.js";

test("free authenticated users are gated before AI diagnosis", async () => {
  const result = resolveDiagnosisGate({
    canDiagnose: false,
    isAuthenticated: true,
    wasLegacyDiagnosisAvailable: true,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.allowed ? "" : result.reason, "upgrade_required");
});

test("entitlement failures fail closed for AI diagnosis", async () => {
  const result = resolveDiagnosisGate({
    entitlementError: true,
    isAuthenticated: true,
    wasLegacyDiagnosisAvailable: true,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.allowed ? "" : result.reason, "entitlement_unavailable");
});

test("legacy anonymous users keep existing diagnosis access", async () => {
  const result = resolveDiagnosisGate({
    isAuthenticated: false,
    wasLegacyDiagnosisAvailable: true,
  });

  assert.deepEqual(result, { allowed: true, mode: "legacy" });
});

test("premium household plan usage allows AI diagnosis", () => {
  const result = resolveAiDiagnosisAccess({
    activeHouseholdId: "household-1",
    householdPlanUsage: { aiAnalyzesRemaining: null, isPremium: true },
    isAuthenticated: true,
    requiresSupabaseHousehold: true,
  });

  assert.deepEqual(result, { allowed: true, status: "allowed" });
});

test("free household with remaining monthly scans allows AI diagnosis", () => {
  const result = resolveAiDiagnosisAccess({
    activeHouseholdId: "household-1",
    householdPlanUsage: { aiAnalyzesRemaining: 1, isPremium: false },
    isAuthenticated: true,
    requiresSupabaseHousehold: true,
  });

  assert.deepEqual(result, { allowed: true, status: "allowed" });
});

test("free household with exhausted monthly scans is blocked before AI diagnosis", () => {
  const result = resolveAiDiagnosisAccess({
    activeHouseholdId: "household-1",
    householdPlanUsage: { aiAnalyzesRemaining: 0, isPremium: false },
    isAuthenticated: true,
    requiresSupabaseHousehold: true,
  });

  assert.deepEqual(result, { allowed: false, status: "limit_reached" });
});

test("authenticated Supabase diagnosis fails closed while household usage is missing", () => {
  const result = resolveAiDiagnosisAccess({
    activeHouseholdId: "household-1",
    householdPlanUsage: null,
    isAuthenticated: true,
    requiresSupabaseHousehold: true,
  });

  assert.deepEqual(result, { allowed: false, status: "checking" });
});

test("diagnosis image validation rejects unsafe uploads", () => {
  assert.throws(
    () => validateDiagnosticImageFile(new File(["bad"], "bad.txt", { type: "text/plain" })),
    /JPG, PNG alebo WEBP/,
  );

  assert.throws(
    () => validateDiagnosticImageFile(new File([new Uint8Array(maxDiagnosticImageBytes + 1)], "large.jpg", { type: "image/jpeg" })),
    /8 MB/,
  );
});

test("diagnosis notes are sanitized and bounded", () => {
  const note = sanitizeDiagnosticNote(`  hello\u0000\n${"x".repeat(1000)}`);
  assert.equal(note.includes("\u0000"), false);
  assert.ok(note.length <= 700);
});

test("supabase-backed diagnostics can be stored without permanent base64 image data", () => {
  const [diagnostic] = sanitizeDiagnosticEntries([
    {
      confidence: 82,
      confidenceLabel: "stredná",
      createdAt: "2026-05-31T10:00:00.000Z",
      diagnosisTitle: "Pravdepodobné preliatie",
      disclaimer: "AI diagnostika je iba odhad.",
      id: "diag-supabase",
      imageDataUrl: "",
      imagePath: "plant-id/image.jpg",
      observedSymptoms: ["žlté listy"],
      plantId: "flower-1",
      reasoningSummary: "Listy pôsobia mäkko a žltnú odspodu.",
      recommendedSteps: ["Skontroluj substrát"],
      riskLevel: "medium",
      storageMode: "supabase",
      updatedAt: "2026-05-31T10:00:00.000Z",
      userConfirmation: "confirmed",
      userNote: "  overené  ",
    },
  ]);

  assert.equal(diagnostic.imageDataUrl, "");
  assert.equal(diagnostic.imagePath, "plant-id/image.jpg");
  assert.equal(diagnostic.storageMode, "supabase");
  assert.equal(diagnostic.userNote, "overené");
});

test("reminder settings are clamped for future push delivery", () => {
  const settings = normalizeReminderSettings({
    fertilizingIntervalDays: 500,
    notificationsEnabled: true,
    preference: "web_push",
    wateringIntervalDays: 0,
  });

  assert.equal(settings.wateringIntervalDays, 1);
  assert.equal(settings.fertilizingIntervalDays, 120);
});
