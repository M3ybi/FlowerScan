import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createTranslator, translate, translations } from "../src/lib/i18n.js";
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
  assert.equal(translate("de", "missing.translation.key"), "missing.translation.key");
});

test("supported non-English languages cover every English translation key", () => {
  const englishKeys = Object.keys(translations.en);

  for (const language of ["de", "fr", "es", "sk"] as const) {
    const missing = englishKeys.filter((key) => !(key in translations[language]));
    assert.deepEqual(missing, [], `${language} is missing translation keys`);
  }
});

test("translated placeholders match the English source placeholders", () => {
  const placeholderPattern = /\{[^}]+\}/g;
  const placeholders = (value: string) => [...value.matchAll(placeholderPattern)].map((match) => match[0]).sort();

  for (const language of ["de", "fr", "es", "sk"] as const) {
    for (const key of Object.keys(translations.en)) {
      assert.deepEqual(
        placeholders(translations[language][key]),
        placeholders(translations.en[key]),
        `${language}.${key} placeholders must match English`,
      );
    }
  }
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

test("subscription restriction copy is user-friendly and localized", () => {
  const i18nSource = readFileSync("src/lib/i18n.ts", "utf8");
  const upgradeModalSource = readFileSync("src/components/UpgradeModal.tsx", "utf8");
  const releaseReadinessSource = readFileSync("src/lib/releaseReadiness.ts", "utf8");

  assert.equal(translate("en", "account.subscriptionServer"), "This feature is not available for your current plan.");
  assert.equal(translate("sk", "account.subscriptionServer"), "Táto funkcia nie je dostupná vo vašom aktuálnom pláne.");
  assert.doesNotMatch(`${i18nSource}\n${upgradeModalSource}\n${releaseReadinessSource}`, /server entitlement|serverov\u00fd entitlement|entitlement required|Serverberechtigung|Droit d'accès au serveur|derecho de servidor/i);
});

test("detail screen uses translator keys for quick actions", () => {
  const appSource = readFileSync("src/App.tsx", "utf8");
  const detailSource = appSource;

  assert.match(detailSource, /t\("detail\.todayTransplanted"\)/);
  assert.match(detailSource, /t\("detail\.todayFertilized"\)/);
  assert.match(detailSource, /t\("detail\.diagnosisTitle"\)/);
  assert.doesNotMatch(detailSource, /Presadená dnes|Pohnojená dnes|AI diagnostika problému|Rastlina vyzerá zle/);
  assert.doesNotMatch(appSource, /plants\.idConfident/);
});
