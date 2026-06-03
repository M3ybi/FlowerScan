import assert from "node:assert/strict";
import test from "node:test";
import { createTranslator, translate } from "../src/lib/i18n.js";
import { onboardingLanguageStorageKey, readStoredLanguage, writeStoredLanguage } from "../src/lib/onboarding.js";

const createStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
};

test("selected language persists through existing onboarding preference", () => {
  const storage = createStorage();
  writeStoredLanguage(storage, "sk");

  assert.equal(storage.getItem(onboardingLanguageStorageKey), "sk");
  assert.equal(readStoredLanguage(storage), "sk");
});

test("missing translation key falls back to English", () => {
  assert.equal(translate("sk", "missing.translation.key"), "missing.translation.key");
  assert.equal(translate("de", "qr.empty"), "No QR labels yet");
});

test("Slovak text renders with valid UTF-8 diacritics", () => {
  const t = createTranslator("sk");

  assert.equal(t("onboarding.languageTitle"), "Vyber jazyk");
  assert.equal(t("account.heading"), "Účet a Premium");
  assert.equal(t("detail.quickAction"), "Čo sa dnes udialo?");
  assert.equal(t("plants.watering"), "Zálievka");
});

test("language switch updates UI strings", () => {
  const english = createTranslator("en");
  const slovak = createTranslator("sk");

  assert.equal(english("nav.plants"), "Plants");
  assert.equal(slovak("nav.plants"), "Rastliny");
  assert.equal(english("auth.login"), "Sign in");
  assert.equal(slovak("auth.login"), "Prihlásiť sa");
});
