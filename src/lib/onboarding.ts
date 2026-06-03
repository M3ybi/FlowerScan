export type PlantieLanguage = "en" | "sk" | "de" | "fr" | "es";
export type OnboardingStep = "language" | "welcome" | "household" | "complete";

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
