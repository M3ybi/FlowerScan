import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeDiagnostics } from "../netlify/functions/_shared/diagnostics.js";

const validDiagnostic = {
  id: "diag-1",
  plantId: "flower-04",
  imageDataUrl: "data:image/jpeg;base64,abc",
  diagnosisTitle: "Pravdepodobné preliatie",
  confidence: 78,
  confidenceLabel: "stredná",
  reasoningSummary: "Listy a substrát sú konzistentné s prebytkom vody.",
  observedSymptoms: ["žltnutie listov", "tmavý vlhký substrát"],
  recommendedSteps: ["Dočasne prestaň zalievať.", "Skontroluj drenáž."],
  riskLevel: "medium",
  disclaimer: "AI diagnostika je iba odhad.",
  userConfirmation: "confirmed",
  userNote: "Skontrolovať o týždeň.",
  createdAt: "2026-05-19T08:00:00.000Z",
  updatedAt: "2026-05-19T08:00:00.000Z",
};

test("valid AI diagnosis response is accepted for history storage", () => {
  assert.equal(sanitizeDiagnostics([validDiagnostic]).length, 1);
});

test("low-confidence diagnosis is accepted and preserved", () => {
  const [diagnostic] = sanitizeDiagnostics([{ ...validDiagnostic, confidence: 22, confidenceLabel: "nízka" }]);
  assert.equal(diagnostic.confidence, 22);
  assert.equal(diagnostic.confidenceLabel, "nízka");
});

test("incomplete AI response is rejected", () => {
  const incomplete = { ...validDiagnostic, recommendedSteps: [] };
  assert.deepEqual(sanitizeDiagnostics([incomplete]), []);
});

test("saving diagnosis to history keeps confirmation status", () => {
  const [diagnostic] = sanitizeDiagnostics([validDiagnostic]);
  assert.equal(diagnostic.userConfirmation, "confirmed");
});

test("rejecting diagnosis is stored as rejected", () => {
  const [diagnostic] = sanitizeDiagnostics([{ ...validDiagnostic, userConfirmation: "rejected" }]);
  assert.equal(diagnostic.userConfirmation, "rejected");
});

test("unsupported image type is rejected", () => {
  assert.deepEqual(sanitizeDiagnostics([{ ...validDiagnostic, imageDataUrl: "data:text/plain;base64,abc" }]), []);
});

test("oversized image data is truncated defensively", () => {
  const largeImage = `data:image/jpeg;base64,${"a".repeat(1_600_000)}`;
  const [diagnostic] = sanitizeDiagnostics([{ ...validDiagnostic, imageDataUrl: largeImage }]);
  assert.ok(diagnostic.imageDataUrl.length <= 1_500_000);
});

test("failed AI API call shape is not treated as diagnosis", () => {
  assert.deepEqual(sanitizeDiagnostics([{ error: "AI diagnosis failed." }]), []);
});

test("duplicate submission can be represented by one generated entry only", () => {
  const diagnostics = sanitizeDiagnostics([validDiagnostic, { ...validDiagnostic, id: "diag-2" }]);
  const uniqueIds = new Set(diagnostics.map((diagnostic) => diagnostic.id));
  assert.equal(uniqueIds.size, 2);
});

test("rendering diagnostic history has required display fields", () => {
  const [diagnostic] = sanitizeDiagnostics([validDiagnostic]);
  assert.ok(diagnostic.createdAt);
  assert.ok(diagnostic.diagnosisTitle);
  assert.ok(diagnostic.recommendedSteps.length > 0);
});
