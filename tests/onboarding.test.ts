import assert from "node:assert/strict";
import test from "node:test";
import {
  getInitialOnboardingStep,
  hasCompletedOnboarding,
  onboardingAuthChoiceStorageKey,
  onboardingLanguageStorageKey,
  readStoredLanguage,
  shouldBypassOnboarding,
  supportedLanguages,
  writeStoredLanguage,
} from "../src/lib/onboarding.js";

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
