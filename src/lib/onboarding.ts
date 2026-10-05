export type PlantieLanguage = "en" | "sk" | "de" | "fr" | "es";
export type OnboardingStep = "language" | "welcome" | "household" | "complete";

export const defaultLanguage: PlantieLanguage = "en";

export const onboardingLanguageStorageKey = "plantie-language-v1";
export const onboardingStatusStorageKey = "plantie-onboarding-v1";
export const onboardingAuthChoiceStorageKey = "plantie-onboarding-auth-choice-v1";

export const supportedLanguages: Array<{ code: PlantieLanguage; label: string; nativeName: string }> = [
  { code: "en", label: "English", nativeName: "English" },
  { code: "sk", label: "Slovak", nativeName: "Slovencina" },
  { code: "de", label: "German", nativeName: "Deutsch" },
  { code: "fr", label: "French", nativeName: "Francais" },
  { code: "es", label: "Spanish", nativeName: "Espanol" },
];

export const isSupportedLanguage = (value: unknown): value is PlantieLanguage =>
  supportedLanguages.some((language) => language.code === value);

export const resolveAiLanguage = (value: unknown) => {
  const candidate = typeof value === "string" ? value.trim().replace(/_/g, "-") : "";
  let canonicalLocale = "";

  try {
    canonicalLocale = Intl.getCanonicalLocales(candidate)[0] ?? "";
  } catch {
    canonicalLocale = "";
  }

  const supportedLanguage = supportedLanguages.find(
    (language) => language.code.toLowerCase() === canonicalLocale.toLowerCase(),
  ) ?? supportedLanguages.find(
    (language) => language.code.toLowerCase() === canonicalLocale.split("-")[0]?.toLowerCase(),
  );
  const locale = supportedLanguage ? canonicalLocale : defaultLanguage;
  const name = new Intl.DisplayNames(["en"], { type: "language" }).of(locale) ?? supportedLanguage?.label ?? locale;

  return { locale, name };
};

export const buildAiLanguageInstruction = (value: unknown) => {
  const { locale, name } = resolveAiLanguage(value);
  return `Respond exclusively in the user's currently selected application language: ${name} (${locale}). All user-facing generated content must use this language. This instruction overrides the language of the user's input, device or browser language, server locale, geographic location, conversation history, database content, plant names, and any language inferred from context. For structured output, keep JSON keys, enum values, and scientific botanical names unchanged, but write every user-facing string value (including common plant names, descriptions, labels, tips, warnings, and notes) in ${name}. Before responding, check every user-facing string and rewrite any text that remains in another language into ${name}. Follow regional conventions for ${locale} where applicable.`;
};

export const readStoredLanguage = (storage: Pick<Storage, "getItem">): PlantieLanguage | null => {
  const value = storage.getItem(onboardingLanguageStorageKey);
  return isSupportedLanguage(value) ? value : null;
};

export const writeStoredLanguage = (storage: Pick<Storage, "setItem">, language: PlantieLanguage) => {
  storage.setItem(onboardingLanguageStorageKey, language);
};

export const hasCompletedOnboarding = (storage: Pick<Storage, "getItem">) =>
  storage.getItem(onboardingStatusStorageKey) === "complete";

export const markOnboardingComplete = (storage: Pick<Storage, "setItem">) => {
  storage.setItem(onboardingStatusStorageKey, "complete");
};

export const shouldBypassOnboarding = ({
  hasCompleted,
  hasExistingHousehold,
  hasMigratedSupabaseHousehold,
}: {
  hasCompleted: boolean;
  hasExistingHousehold: boolean;
  hasMigratedSupabaseHousehold: boolean;
}) => hasCompleted || hasExistingHousehold || hasMigratedSupabaseHousehold;

export const getInitialOnboardingStep = ({
  hasCompleted,
  hasExistingHousehold,
  hasLanguage,
  hasMigratedSupabaseHousehold,
}: {
  hasCompleted: boolean;
  hasExistingHousehold: boolean;
  hasLanguage: boolean;
  hasMigratedSupabaseHousehold: boolean;
}): OnboardingStep => {
  if (shouldBypassOnboarding({ hasCompleted, hasExistingHousehold, hasMigratedSupabaseHousehold })) {
    return "complete";
  }

  return hasLanguage ? "welcome" : "language";
};
