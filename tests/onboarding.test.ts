import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildAiLanguageInstruction,
  defaultLanguage,
  getInitialOnboardingStep,
  hasCompletedOnboarding,
  onboardingAuthChoiceStorageKey,
  onboardingLanguageStorageKey,
  readStoredLanguage,
  resolveAiLanguage,
  shouldBypassOnboarding,
  supportedLanguages,
  writeStoredLanguage,
} from "../src/lib/onboarding.js";

const readSource = (path: string) => readFileSync(path, "utf8");

const createStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
};

test("first launch shows language selection", () => {
  assert.equal(
    getInitialOnboardingStep({
      hasCompleted: false,
      hasExistingHousehold: false,
      hasLanguage: false,
      hasMigratedSupabaseHousehold: false,
    }),
    "language",
  );
  assert.deepEqual(
    supportedLanguages.map((language) => language.code),
    ["en", "sk", "de", "fr", "es"],
  );
});

test("language persists", () => {
  const storage = createStorage();
  writeStoredLanguage(storage, "sk");

  assert.equal(storage.getItem(onboardingLanguageStorageKey), "sk");
  assert.equal(readStoredLanguage(storage), "sk");
  assert.equal(
    getInitialOnboardingStep({
      hasCompleted: false,
      hasExistingHousehold: false,
      hasLanguage: Boolean(readStoredLanguage(storage)),
      hasMigratedSupabaseHousehold: false,
    }),
    "welcome",
  );
});

test("dashboard hidden before onboarding", () => {
  assert.notEqual(
    getInitialOnboardingStep({
      hasCompleted: false,
      hasExistingHousehold: false,
      hasLanguage: true,
      hasMigratedSupabaseHousehold: false,
    }),
    "complete",
  );
});

test("household is not auto-created by onboarding state", () => {
  const storage = createStorage();
  storage.setItem(onboardingAuthChoiceStorageKey, "google");

  assert.equal(hasCompletedOnboarding(storage), false);
  assert.equal(shouldBypassOnboarding({ hasCompleted: false, hasExistingHousehold: false, hasMigratedSupabaseHousehold: false }), false);
});

test("authenticated user can proceed to manual household creation", () => {
  assert.equal(
    getInitialOnboardingStep({
      hasCompleted: false,
      hasExistingHousehold: false,
      hasLanguage: true,
      hasMigratedSupabaseHousehold: false,
    }),
    "welcome",
  );
});

test("existing users bypass onboarding safely", () => {
  assert.equal(
    getInitialOnboardingStep({
      hasCompleted: false,
      hasExistingHousehold: true,
      hasLanguage: false,
      hasMigratedSupabaseHousehold: false,
    }),
    "complete",
  );
  assert.equal(
    getInitialOnboardingStep({
      hasCompleted: false,
      hasExistingHousehold: false,
      hasLanguage: false,
      hasMigratedSupabaseHousehold: true,
    }),
    "complete",
  );
});

test("AI language resolves generically from all configured application languages", () => {
  for (const language of supportedLanguages) {
    assert.equal(resolveAiLanguage(language.code).locale, language.code);
    assert.ok(buildAiLanguageInstruction(language.code).includes(language.label));
  }
});

test("AI language preserves regional locale variants when their base language is supported", () => {
  assert.deepEqual(resolveAiLanguage("de-DE"), { locale: "de-DE", name: "German (Germany)" });
  assert.deepEqual(resolveAiLanguage("en_GB"), {
    locale: "en-GB",
    name: new Intl.DisplayNames(["en"], { type: "language" }).of("en-GB"),
  });
});

test("missing and invalid AI locales use the configured application fallback", () => {
  assert.equal(resolveAiLanguage(null).locale, defaultLanguage);
  assert.equal(resolveAiLanguage("xx-Invalid").locale, defaultLanguage);
  assert.equal(resolveAiLanguage(" ").locale, defaultLanguage);
});

test("each AI request instruction prioritizes the current language over input and history", () => {
  const germanInstruction = buildAiLanguageInstruction("de");
  assert.match(germanInstruction, /exclusively in the user's currently selected application language: German \(de\)/);
  assert.match(germanInstruction, /overrides the language of the user's input/);
  assert.match(germanInstruction, /conversation history/);
  assert.match(germanInstruction, /every user-facing string value/);
  assert.match(germanInstruction, /rewrite any text that remains in another language into German/);
  assert.match(germanInstruction, /keep JSON keys, enum values, and scientific botanical names unchanged/);
  assert.notEqual(germanInstruction, buildAiLanguageInstruction("en"));
});

test("all AI provider endpoints use the shared selected-language instruction", () => {
  const endpoints = [
    "netlify/functions/plant-care-ai.ts",
    "netlify/functions/plant-diagnosis-ai.ts",
    "supabase/functions/plant-care-ai/index.ts",
    "supabase/functions/plant-diagnosis-ai/index.ts",
    "supabase/functions/validate-plant-image/index.ts",
    "supabase/functions/upload-validated-image/index.ts",
  ];

  for (const endpoint of endpoints) {
    assert.match(readSource(endpoint), /instructions: buildAiLanguageInstruction\(/, `${endpoint} must enforce the current app language`);
  }

  const careEndpoint = readSource("supabase/functions/plant-care-ai/index.ts");
  const diagnosisEndpoint = readSource("supabase/functions/plant-diagnosis-ai/index.ts");
  assert.match(careEndpoint, /label: \{ type: "string" \}/);
  assert.match(diagnosisEndpoint, /confidence_label: \{ enum: \["low", "medium", "high"\]/);
  assert.match(readSource("src/utils/customFlower.ts"), /language: options\.language/);
  assert.match(readSource("src/utils/diagnostics.ts"), /body: \{ householdId, imageDataUrl, language,/);
  assert.match(readSource("src/utils/imageUploadValidation.ts"), /body: \{ imageDataUrl, language \}/);
  assert.match(readSource("src/lib/plantieRepository.ts"), /language: typeof globalThis\.localStorage/);
});
