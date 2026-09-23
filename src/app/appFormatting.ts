import { defaultLanguage, type createTranslator } from "../lib/i18n";
import type { PlantieLanguage } from "../lib/onboarding";
import { createHouseholdUrl, isValidHouseholdToken } from "../utils/household";
import { flowerPath } from "../utils/links";
import { isIsoDate } from "../utils/dates";
import type { getWateringProgress } from "../utils/watering";

const localeByLanguage: Record<PlantieLanguage, string> = {
  de: "de-DE",
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  sk: "sk-SK",
};

export const todayIsoDate = () => {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${today.getFullYear()}-${month}-${day}`;
};

export const formatLocalizedDate = (
  value: string,
  language: PlantieLanguage | null,
  t: ReturnType<typeof createTranslator>,
) => {
  if (!isIsoDate(value)) {
    return t("date.empty");
  }

  return new Intl.DateTimeFormat(localeByLanguage[language ?? defaultLanguage], {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
};

export const formatLocalizedElapsedDays = (value: number | null, t: ReturnType<typeof createTranslator>) => {
  if (value === null) {
    return t("date.new");
  }

  if (value === 0) {
    return t("date.todayLower");
  }

  if (value === 1) {
    return t("date.oneDayAgo");
  }

  return t("date.daysAgo", { count: value });
};

export const formatLocalizedWateringStatus = (
  progress: ReturnType<typeof getWateringProgress>,
  t: ReturnType<typeof createTranslator>,
) => {
  if (progress.state === "unknown") {
    return t("watering.notSet");
  }

  if (progress.daysLeft < 0) {
    return t("watering.overdue", { count: Math.abs(progress.daysLeft) });
  }

  if (progress.daysLeft === 0) {
    return t("watering.today");
  }

  return t("watering.inDays", { count: progress.daysLeft });
};

export const normalizeBaseUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
};

export const currentBaseUrl = () => {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}`;
};

export const currentHouseholdBaseUrl = (householdToken: string) =>
  isValidHouseholdToken(householdToken) ? createHouseholdUrl(householdToken, "").replace(/#\/?$/, "") : currentBaseUrl();

export const publicFlowerUrl = (baseUrl: string, flowerId: string) =>
  `${normalizeBaseUrl(baseUrl)}${flowerPath(flowerId, true)}`;

export const pageTitle = (pageName: string) => `${pageName} | Plantie`;
