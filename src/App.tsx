import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Bell,
  Camera,
  Check,
  ChevronRight,
  Copy,
  Droplets,
  FileDown,
  ImagePlus,
  Home,
  KeyRound,
  Leaf,
  Pencil,
  Plus,
  Printer,
  QrCodeIcon,
  Search,
  Settings,
  Sparkles,
  Sprout,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, MouseEvent } from "react";
import { AuthPanel } from "./components/AuthPanel";
import { PricingPage } from "./components/PricingPage";
import { QrCode } from "./components/QrCode";
import { HealthPage, LegalPageView, ReleaseChecklistPage } from "./components/ReleasePages";
import { UpgradeModal } from "./components/UpgradeModal";
import { flowers as builtInFlowers } from "./data/flowers";
import type { Flower } from "./data/flowers";
import { wateringIntervalsDays } from "./data/wateringIntervals";
import { useAuth } from "./hooks/useAuth";
import { useCustomFlowers } from "./hooks/useCustomFlowers";
import { useFlowerRecords } from "./hooks/useFlowerRecords";
import type { FlowerRecords } from "./hooks/useFlowerRecords";
import { checkDiagnosisGate, recordDiagnosisUsage } from "./lib/diagnosisGate";
import { captureImage, detectImageRuntime } from "./lib/imageCaptureService";
import type { NormalizedImage } from "./lib/imageCaptureService";
import { createTranslator, defaultLanguage, translate } from "./lib/i18n";
import {
  getInitialOnboardingStep,
  hasCompletedOnboarding,
  markOnboardingComplete,
  readStoredLanguage,
  supportedLanguages,
  writeStoredLanguage,
} from "./lib/onboarding";
import type { OnboardingStep, PlantieLanguage } from "./lib/onboarding";
import { signOut } from "./lib/authService";
import { isSupabaseConfigured } from "./lib/supabase";
import {
  detectDataSourceMode,
  loadSupabaseReadThroughState,
} from "./lib/supabaseReadThrough";
import type { SupabaseReadThroughState } from "./lib/supabaseReadThrough";
import {
  createSupabaseDiagnosis,
  detectSupabaseWriteMode,
  runRequiredSupabaseWrite,
  runSupabaseWrite,
  setSupabasePlantRemoved,
  updateSupabaseCareRecord,
  updateSupabaseDiagnosis,
  upsertSupabasePlantFromFlower,
} from "./lib/supabaseSourceOfTruth";
import {
  createHousehold,
  createHouseholdInvite,
  getHouseholdPlantByLegacyId,
  getPlantDiagnostics,
  getUserHouseholds,
  isValidInviteEmail,
  joinHouseholdByInvite,
  listHouseholdInvites,
  listHouseholdMembers,
  normalizeInviteEmail,
  revokeHouseholdInvite,
  sendHouseholdInviteEmail,
} from "./lib/plantieRepository";
import type { HouseholdInvite, HouseholdMember, HouseholdRole } from "./lib/plantieRepository";
import {
  createCustomFlowerId,
  fetchGeneratedCare,
  imageSourceToDataUrl,
} from "./utils/customFlower";
import type { GeneratedCare } from "./utils/customFlower";
import { daysSince, formatDate, formatElapsedDays, isIsoDate } from "./utils/dates";
import {
  clearHouseholdSession,
  createHouseholdApiUrl,
  createHouseholdUrl,
  getHouseholdTokenFromUrl,
  getStoredHouseholdSession,
  isValidHouseholdToken,
  removeHouseholdFromCurrentUrl,
  storeHouseholdSession,
} from "./utils/household";
import type { HouseholdSession } from "./utils/household";
import { flowerPath } from "./utils/links";
import { exportQrLabelsPdf, validateQrLabelLayout, createQrLabelLayout, qrLabelSpec } from "./utils/qrPdf";
import { getWateringProgress } from "./utils/watering";
import {
  isPushNotificationSupported,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from "./utils/pushNotifications";
import {
  createDiagnosticId,
  fetchPlantDiagnosis,
  sanitizeDiagnosticNote,
  sanitizeDiagnosticEntries,
} from "./utils/diagnostics";
import { imageUploadRejectionMessage, validatePlantImageForUpload } from "./utils/imageUploadValidation";
import type { DiagnosisConfirmation, PlantDiagnosisDraft, PlantDiagnosticEntry } from "./utils/diagnostics";
import type { LegalPageId } from "./lib/releaseReadiness";
import { callBackendFunction, isLegacyNetlifyBackendEnabled, isSupabaseBackend } from "./lib/backendConfig";

const todayIsoDate = () => {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${today.getFullYear()}-${month}-${day}`;
};

const localeByLanguage: Record<PlantieLanguage, string> = {
  de: "de-DE",
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  sk: "sk-SK",
};

const formatLocalizedDate = (value: string, language: PlantieLanguage | null, t: ReturnType<typeof createTranslator>) => {
  if (!isIsoDate(value)) {
    return t("date.empty");
  }

  return new Intl.DateTimeFormat(localeByLanguage[language ?? defaultLanguage], {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
};

const formatLocalizedElapsedDays = (value: number | null, t: ReturnType<typeof createTranslator>) => {
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

const formatLocalizedWateringStatus = (
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

const normalizeBaseUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
};

const currentBaseUrl = () => {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}`;
};

const currentHouseholdBaseUrl = (householdToken: string) =>
  isValidHouseholdToken(householdToken) ? createHouseholdUrl(householdToken, "").replace(/#\/?$/, "") : currentBaseUrl();

const publicFlowerUrl = (baseUrl: string, flowerId: string) =>
  `${normalizeBaseUrl(baseUrl)}${flowerPath(flowerId, true)}`;

const normalizeCareText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const includesAny = (value: string, keywords: string[]) => keywords.some((keyword) => value.includes(keyword));

const getWaterIconLevel = (value: string, intervalDays: number) => {
  const normalizedValue = normalizeCareText(value);

  if (
    includesAny(normalizedValue, [
      "nechat uplne vyschnut",
      "po uplnom vyschnuti",
      "po vyschnuti",
      "az po preschnuti",
      "az po vyschnuti",
      "mierne",
      "striedmo",
      "such",
      "sukulent",
      "kaktus",
    ]) ||
    intervalDays >= 14
  ) {
    return "low";
  }

  if (
    includesAny(normalizedValue, ["udrziavat vlhku", "stale mierne vlhku", "rovnomerne vlhku", "vela vody", "castejsie"]) ||
    intervalDays <= 5
  ) {
    return "high";
  }

  return "medium";
};

const getSunIconLevel = (value: string) => {
  const normalizedValue = normalizeCareText(value);

  if (includesAny(normalizedValue, ["plne slnko", "priame slnko", "vela svetla", "velmi jasne", "slnecne", "6 hodin"])) {
    return "full";
  }

  if (includesAny(normalizedValue, ["polotien", "tien", "menej svetla", "slabsie svetlo", "nizke svetlo"])) {
    return "low";
  }

  return "half";
};

const getHumidityIconLevel = (value: string) => {
  const normalizedValue = normalizeCareText(value);

  if (includesAny(normalizedValue, ["nizs", "nizka", "suchy vzduch", "bez rosenia", "nie je narocna", "bezna izbova"])) {
    return "low";
  }

  if (includesAny(normalizedValue, ["vysok", "vyss", "rosit", "vlhkomil", "terarium"])) {
    return "high";
  }

  return "medium";
};

const getDifficultyIconLevel = (value: string) => {
  const normalizedValue = normalizeCareText(value);

  if (includesAny(normalizedValue, ["nenaroc", "lahk", "jednoduch", "zaciatocnik", "odolna"])) {
    return "easy";
  }

  if (includesAny(normalizedValue, ["stredn", "mierna"])) {
    return "medium";
  }

  if (includesAny(normalizedValue, ["naroc", "citliv", "skusen"])) {
    return "hard";
  }

  return "medium";
};

const getCarePillVisual = (label: string, value: string, intervalDays: number) => {
  const normalizedLabel = normalizeCareText(label);

  if (normalizedLabel.includes("svetlo")) {
    const strength = getSunIconLevel(value);

    return (
      <span className={`pill-visual pill-sun pill-sun-${strength}`} aria-hidden="true">
        <span />
      </span>
    );
  }

  if (normalizedLabel.includes("zalievka")) {
    const level = getWaterIconLevel(value, intervalDays);

    return (
      <span className={`pill-visual pill-water pill-water-${level}`} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    );
  }

  if (normalizedLabel.includes("vlhkost")) {
    const level = getHumidityIconLevel(value);

    return (
      <span className={`pill-visual pill-humidity pill-humidity-${level}`} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    );
  }

  if (normalizedLabel.includes("narocnost")) {
    const level = getDifficultyIconLevel(value);

    return (
      <span className={`pill-visual pill-difficulty pill-difficulty-${level}`} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    );
  }

  return (
    <span className="pill-visual pill-pot" aria-hidden="true">
      <span />
    </span>
  );
};

type CarePreview = {
  flowerId: string;
  nextCare: GeneratedCare;
};

type CareDiffRow = {
  label: string;
  currentValue: string;
  nextValue: string;
};

const formatCarePills = (carePills: Flower["carePills"]) =>
  carePills.map((pill) => `${pill.label}: ${pill.value}`).join("\n");

const formatCareTips = (careTips: string[]) => careTips.map((tip) => `- ${tip}`).join("\n");

const getCareDiffRows = (
  flower: Flower,
  nextCare: GeneratedCare,
  currentIntervalDays: number,
  t: ReturnType<typeof createTranslator>,
): CareDiffRow[] => {
  const candidates: CareDiffRow[] = [
    { label: t("careDiff.name"), currentValue: flower.displayName, nextValue: nextCare.displayName },
    { label: t("careDiff.botanicalId"), currentValue: flower.likelyName, nextValue: nextCare.likelyName },
    { label: t("careDiff.shortCare"), currentValue: flower.shortCare, nextValue: nextCare.shortCare },
    { label: t("careDiff.quickPills"), currentValue: formatCarePills(flower.carePills), nextValue: formatCarePills(nextCare.carePills) },
    { label: t("detail.light"), currentValue: flower.light, nextValue: nextCare.light },
    { label: t("plants.watering"), currentValue: flower.watering, nextValue: nextCare.watering },
    {
      label: t("careDiff.wateringInterval"),
      currentValue: t("careDiff.days", { count: currentIntervalDays }),
      nextValue: t("careDiff.days", { count: nextCare.wateringIntervalDays }),
    },
    { label: t("detail.substrate"), currentValue: flower.soil, nextValue: nextCare.soil },
    { label: t("detail.careTips"), currentValue: formatCareTips(flower.careTips), nextValue: formatCareTips(nextCare.careTips) },
    { label: t("careDiff.identificationNote"), currentValue: flower.identificationNote, nextValue: nextCare.identificationNote },
  ];

  return candidates.filter((row) => row.currentValue.trim() !== row.nextValue.trim());
};

const applyGeneratedCareToFlower = (flower: Flower, nextCare: GeneratedCare): Flower => {
  const { displayName, identificationConfidence, ...careProfile } = nextCare;

  return {
    ...flower,
    ...careProfile,
    displayName: displayName.trim() || flower.displayName,
    identification: identificationConfidence,
    source: "custom",
  };
};

const recordHasValue = (record: FlowerRecords[string] | undefined) =>
  Boolean(record?.note || record?.lastFertilized || record?.lastWatered || record?.lastTransplanted);

const mergeCloudRecords = (localRecords: FlowerRecords, cloudRecords: FlowerRecords) => {
  const flowerIds = new Set([...Object.keys(localRecords), ...Object.keys(cloudRecords)]);

  return Object.fromEntries(
    [...flowerIds].map((flowerId) => [
      flowerId,
      recordHasValue(cloudRecords[flowerId]) ? cloudRecords[flowerId] : localRecords[flowerId],
    ]),
  ) as FlowerRecords;
};

const diagnosticsStorageKey = "flowscan-plant-diagnostics-v1";

const readStoredDiagnostics = () => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    return sanitizeDiagnosticEntries(JSON.parse(window.localStorage.getItem(diagnosticsStorageKey) ?? "[]"));
  } catch {
    return [];
  }
};

const riskLevelLabel = (riskLevel: PlantDiagnosticEntry["riskLevel"], t: ReturnType<typeof createTranslator>) =>
  riskLevel === "high" ? t("diagnosis.riskHigh") : riskLevel === "medium" ? t("diagnosis.riskMedium") : t("diagnosis.riskLow");

const flowerDiagnosticsCount = (flowerId: string, diagnostics: PlantDiagnosticEntry[]) =>
  diagnostics.filter((diagnostic) => diagnostic.plantId === flowerId).length;

type MobileBottomNavPage = "plants" | "diagnose" | "add" | "qr" | "menu";

const MobileBottomNav = ({
  currentPage,
  onAddPlant,
  t,
}: {
  currentPage: MobileBottomNavPage;
  onAddPlant: () => void;
  t: ReturnType<typeof createTranslator>;
}) => (
  <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
    <a className={currentPage === "plants" ? "active" : ""} href="#/">
      <Leaf size={18} aria-hidden="true" />
      {t("nav.plants")}
    </a>
    <a className={currentPage === "diagnose" ? "active" : ""} href="#/diagnose">
      <Camera size={18} aria-hidden="true" />
      {t("nav.diagnose")}
    </a>
    <button type="button" className="mobile-bottom-nav-action" onClick={onAddPlant}>
      <Plus size={18} aria-hidden="true" />
      {t("dashboard.addPlant")}
    </button>
    <a className={currentPage === "qr" ? "active" : ""} href="#/qr">
      <QrCodeIcon size={18} aria-hidden="true" />
      {t("nav.qr")}
    </a>
    <a className={currentPage === "menu" ? "active" : ""} href="#/menu">
      <Home size={18} aria-hidden="true" />
      {t("nav.menu")}
    </a>
  </nav>
);

const AppTabNav = ({
  currentPage,
  onAddPlant,
  t,
}: {
  currentPage: MobileBottomNavPage;
  onAddPlant: () => void;
  t: ReturnType<typeof createTranslator>;
}) => (
  <nav className="app-tab-nav" aria-label="Main navigation">
    <a className={currentPage === "plants" ? "active" : ""} href="#/">
      <Leaf size={18} aria-hidden="true" />
      {t("nav.plants")}
    </a>
    <a className={currentPage === "diagnose" ? "active" : ""} href="#/diagnose">
      <Camera size={18} aria-hidden="true" />
      {t("nav.diagnose")}
    </a>
    <button type="button" className={currentPage === "add" ? "active app-tab-nav-action" : "app-tab-nav-action"} onClick={onAddPlant}>
      <Plus size={18} aria-hidden="true" />
      {t("dashboard.addPlant")}
    </button>
    <a className={currentPage === "qr" ? "active" : ""} href="#/qr">
      <QrCodeIcon size={18} aria-hidden="true" />
      {t("nav.qr")}
    </a>
    <a className={currentPage === "menu" ? "active" : ""} href="#/menu">
      <Home size={18} aria-hidden="true" />
      {t("nav.menu")}
    </a>
  </nav>
);

const useHashRoute = () => {
  const [hash, setHash] = useState(() => window.location.hash || "#/");

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const match = hash.match(/^#\/flower\/([^/?]+)(?:\?(.+))?$/);
  if (match) {
    const params = new URLSearchParams(match[2] ?? "");
    return { page: "detail" as const, flowerId: decodeURIComponent(match[1]), scan: params.get("scan") === "1" };
  }

  if (hash === "#/qr") {
    return { page: "qr" as const };
  }

  if (hash === "#/diagnose") {
    return { page: "diagnose" as const };
  }

  const menuMatch = hash.match(/^#\/(?:account|menu)(?:\?(.+))?$/);
  if (menuMatch) {
    const params = new URLSearchParams(menuMatch[1] ?? "");
    return { page: "menu" as const, section: params.get("section") ?? "" };
  }

  const joinMatch = hash.match(/^#\/join(?:\?(.+))?$/);
  if (joinMatch) {
    const params = new URLSearchParams(joinMatch[1] ?? "");
    return { invite: params.get("invite") ?? "", page: "join" as const };
  }

  const legalPageMatch = hash.match(/^#\/(privacy|terms|support|delete-account|subscription-terms)$/);
  if (legalPageMatch) {
    return { page: "legal" as const, legalPageId: legalPageMatch[1] as LegalPageId };
  }

  if (hash === "#/release-readiness") {
    return { page: "release-readiness" as const };
  }

  if (hash === "#/health") {
    return { page: "health" as const };
  }

  return { page: "dashboard" as const };
};

const pageTitle = (pageName: string) => `${pageName} | Plantie`;

const isSupabaseReadThroughEnabled = isSupabaseConfigured && import.meta.env.VITE_DISABLE_SUPABASE_READS !== "true";
const isSupabaseWriteThroughEnvEnabled = isSupabaseReadThroughEnabled && import.meta.env.VITE_ENABLE_SUPABASE_WRITES === "true";
const isSupabaseOnlyDataMode = isSupabaseReadThroughEnabled && isSupabaseWriteThroughEnvEnabled && isSupabaseBackend;
const supabaseWritesDisabledStorageKey = "plantie-disable-supabase-writes-v1";
const pendingInviteStorageKey = "plantie-pending-household-invite-v1";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value: string) => uuidPattern.test(value);

const createInviteUrl = (token: string) => {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = `#/join?invite=${encodeURIComponent(token)}`;
  return url.toString();
};

const normalizeInviteTokenInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    const hashQuery = parsed.hash.match(/^#\/join(?:\?(.+))?$/)?.[1] ?? "";
    return new URLSearchParams(hashQuery).get("invite")?.trim() ?? trimmed;
  } catch {
    const hashQuery = trimmed.match(/^#\/join(?:\?(.+))?$/)?.[1] ?? "";
    return hashQuery ? new URLSearchParams(hashQuery).get("invite")?.trim() ?? "" : trimmed;
  }
};

const isLikelyInviteToken = (value: string) => value.length >= 32 && /^[A-Za-z0-9_-]+$/.test(value);

const isActiveInvite = (invite: HouseholdInvite) =>
  !invite.usedAt && !invite.revokedAt && (!invite.expiresAt || new Date(invite.expiresAt).getTime() > Date.now());

const inviteErrorMessage = (error: unknown) => {
  const details = typeof error === "object" && error !== null ? error as { code?: string; details?: string; hint?: string; message?: string } : {};
  const message = [details.message, details.details, details.hint, details.code]
    .filter((item): item is string => typeof item === "string")
    .join(" ")
    .toLowerCase();

  if (message.includes("active invite already exists") || message.includes("duplicate")) {
    return "household.inviteStatusDuplicate";
  }

  if (message.includes("invalid invite email") || message.includes("valid family member email") || message.includes("invalid email")) {
    return "household.inviteStatusInvalidEmail";
  }

  if (message.includes("expiration") || message.includes("future")) {
    return "household.inviteStatusExpiry";
  }

  if (message.includes("permission") || message.includes("access") || message.includes("owner") || message.includes("editor") || message.includes("42501")) {
    return "household.inviteStatusPermission";
  }

  if (message.includes("jwt") || message.includes("auth") || message.includes("not authenticated") || message.includes("401")) {
    return "household.inviteStatusAuth";
  }

  if (message.includes("schema cache") || message.includes("pgrst202") || message.includes("could not find the function")) {
    return "household.inviteStatusConfig";
  }

  return "household.inviteStatusGeneric";
};

const safeInviteDebugMessage = (error: unknown) => {
  if (import.meta.env.PROD || typeof error !== "object" || error === null) {
    return "";
  }

  const details = error as { code?: string; details?: string; hint?: string; message?: string };
  return [details.code, details.message, details.details, details.hint]
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .join(" | ")
    .slice(0, 240);
};

const joinInviteErrorMessage = (error: unknown) => {
  const details = typeof error === "object" && error !== null ? error as { code?: string; details?: string; hint?: string; message?: string } : {};
  const message = [details.message, details.details, details.hint, details.code]
    .filter((item): item is string => typeof item === "string")
    .join(" ")
    .toLowerCase();

  if (message.includes("expired") || message.includes("revoked") || message.includes("invalid") || message.includes("used")) {
    return "household.inviteStatusInvalidOrExpired";
  }

  if (message.includes("jwt") || message.includes("auth") || message.includes("not authenticated") || message.includes("401")) {
    return "household.inviteStatusAuthRequired";
  }

  if (message.includes("schema cache") || message.includes("pgrst202") || message.includes("could not find the function")) {
    return "household.inviteStatusConfig";
  }

  return "household.joinFailed";
};

const areStringRecordsEqual = (left: Record<string, string>, right: Record<string, string>) => {
  const leftEntries = Object.entries(left);
  if (leftEntries.length !== Object.keys(right).length) {
    return false;
  }

  return leftEntries.every(([key, value]) => right[key] === value);
};

type HouseholdLookupStatus = "idle" | "checking" | "complete";

export const App = () => {
  const route = useHashRoute();
  const auth = useAuth();
  const {
    addCustomFlower,
    customFlowers,
    removeFlower,
    removedFlowerIds,
    replaceCustomFlowers,
    replaceRemovedFlowerIds,
    updateFlower,
  } = useCustomFlowers();
  const legacyAllFlowers = useMemo(
    () =>
      isSupabaseOnlyDataMode
        ? []
        : [
            ...customFlowers,
            ...builtInFlowers.filter((flower) => !customFlowers.some((customFlower) => customFlower.id === flower.id)),
          ].filter((flower) => !removedFlowerIds.includes(flower.id)),
    [customFlowers, removedFlowerIds],
  );
  const legacyAllFlowersIncludingRemoved = useMemo(
    () =>
      isSupabaseOnlyDataMode
        ? []
        : [...customFlowers, ...builtInFlowers.filter((flower) => !customFlowers.some((customFlower) => customFlower.id === flower.id))],
    [customFlowers],
  );
  const { records: legacyRecords, replaceRecords, updateRecord } = useFlowerRecords(legacyAllFlowers);
  const [query, setQuery] = useState("");
  const [baseUrl, setBaseUrl] = useState(() => currentBaseUrl());
  const [activeHousehold, setActiveHousehold] = useState<HouseholdSession | null>(() => getStoredHouseholdSession());
  const [previousHousehold, setPreviousHousehold] = useState<HouseholdSession | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<PlantieLanguage | null>(() => readStoredLanguage(window.localStorage));
  const t = useMemo(() => createTranslator(selectedLanguage), [selectedLanguage]);
  const formatAppDate = (value: string) => formatLocalizedDate(value, selectedLanguage, t);
  const formatAppElapsedDays = (value: number | null) => formatLocalizedElapsedDays(value, t);
  const formatAppWateringStatus = (progress: ReturnType<typeof getWateringProgress>) => formatLocalizedWateringStatus(progress, t);
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>(() =>
    getInitialOnboardingStep({
      hasCompleted: hasCompletedOnboarding(window.localStorage),
      hasExistingHousehold: Boolean(getStoredHouseholdSession() || getHouseholdTokenFromUrl()),
      hasLanguage: Boolean(readStoredLanguage(window.localStorage)),
      hasMigratedSupabaseHousehold: false,
    }),
  );
  const [onboardingStatus, setOnboardingStatus] = useState("");
  const [isNewOnboardingHousehold, setIsNewOnboardingHousehold] = useState(false);
  const [accessStatus, setAccessStatus] = useState("");
  const [householdNameDraft, setHouseholdNameDraft] = useState(() => translate(readStoredLanguage(window.localStorage), "household.defaultName"));
  const [householdLinkStatus, setHouseholdLinkStatus] = useState("");
  const [isHouseholdSheetOpen, setIsHouseholdSheetOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<HouseholdRole>("editor");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteExpiresAt, setInviteExpiresAt] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");
  const [inviteStatusTone, setInviteStatusTone] = useState<"error" | "info" | "success">("info");
  const inviteStatusClass = inviteStatus ? `report-status invite-status invite-status-${inviteStatusTone}` : "";
  const [createdInviteLink, setCreatedInviteLink] = useState("");
  const [householdInvites, setHouseholdInvites] = useState<HouseholdInvite[]>([]);
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMember[]>([]);
  const [joinInviteInput, setJoinInviteInput] = useState("");
  const [isAccessChecking, setIsAccessChecking] = useState(true);
  const [householdLookupStatus, setHouseholdLookupStatus] = useState<HouseholdLookupStatus>("idle");
  const [isCreatingHousehold, setIsCreatingHousehold] = useState(false);
  const [, setReportRecipient] = useState(() => window.localStorage.getItem("flowscan-report-recipient-v1") ?? "");
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(false);
  const [cloudSyncReady, setCloudSyncReady] = useState(false);
  const [qrExportStatus, setQrExportStatus] = useState("");
  const [newPlantName, setNewPlantName] = useState("");
  const [newPlantImage, setNewPlantImage] = useState<NormalizedImage | null>(null);
  const [newPlantStatus, setNewPlantStatus] = useState("");
  const [isAddingPlant, setIsAddingPlant] = useState(false);
  const [isAddPlantModalOpen, setIsAddPlantModalOpen] = useState(false);
  const [plantPage, setPlantPage] = useState(1);
  const [deleteFlowerId, setDeleteFlowerId] = useState("");
  const [carePreview, setCarePreview] = useState<CarePreview | null>(null);
  const [carePreviewStatus, setCarePreviewStatus] = useState("");
  const [isGeneratingCarePreview, setIsGeneratingCarePreview] = useState(false);
  const [editingNameFlowerId, setEditingNameFlowerId] = useState("");
  const [draftFlowerName, setDraftFlowerName] = useState("");
  const [pushStatus, setPushStatus] = useState("");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [legacyDiagnostics, setDiagnostics] = useState<PlantDiagnosticEntry[]>(() => readStoredDiagnostics());
  const [isDiagnosisModalOpen, setIsDiagnosisModalOpen] = useState(false);
  const [diagnosisImageDataUrl, setDiagnosisImageDataUrl] = useState("");
  const [diagnosisImagePreviewUrl, setDiagnosisImagePreviewUrl] = useState("");
  const [diagnosisDraft, setDiagnosisDraft] = useState<PlantDiagnosisDraft | null>(null);
  const [diagnosisUserNote, setDiagnosisUserNote] = useState("");
  const [diagnosisStatus, setDiagnosisStatus] = useState("");
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosisSymptomNotes, setDiagnosisSymptomNotes] = useState("");
  const [diagnosisUpgradeReason, setDiagnosisUpgradeReason] = useState("");
  const [openDiagnosticId, setOpenDiagnosticId] = useState("");
  const [deleteAccountContact, setDeleteAccountContact] = useState(() => auth.user?.email ?? "");
  const [deleteAccountStatus, setDeleteAccountStatus] = useState("");
  const [accountActionStatus, setAccountActionStatus] = useState("");
  const [healthEndpointStatus, setHealthEndpointStatus] = useState("");
  const [supabasePlantIdsByLegacyId, setSupabasePlantIdsByLegacyId] = useState<Record<string, string>>({});
  const [quickRecordStatus, setQuickRecordStatus] = useState("");
  const [supabaseReadState, setSupabaseReadState] = useState<SupabaseReadThroughState | null>(null);
  const [supabaseReadError, setSupabaseReadError] = useState(false);
  const previousAuthUserIdRef = useRef<string | null>(null);
  const [isSupabaseWritesLocallyDisabled] = useState(
    () => window.localStorage.getItem(supabaseWritesDisabledStorageKey) === "true",
  );
  const isSupabaseWriteThroughEnabled = isSupabaseWriteThroughEnvEnabled && !isSupabaseWritesLocallyDisabled;
  const shouldUseSupabaseAccountData = isSupabaseReadThroughEnabled && isSupabaseBackend && (auth.loading || auth.isAuthenticated);
  const isNativeImageRuntime = detectImageRuntime() !== "web";
  const dataSourceMode = detectDataSourceMode({
    featureEnabled: isSupabaseReadThroughEnabled,
    hasAuthenticatedUser: auth.isAuthenticated,
    hasMigratedHousehold: Boolean(supabaseReadState),
    readError: supabaseReadError,
    writesEnabled: isSupabaseWriteThroughEnabled,
  });
  const activeSupabaseHouseholdId =
    supabaseReadState?.household.id ??
    (!shouldUseSupabaseAccountData && activeHousehold && isUuid(activeHousehold.publicToken) ? activeHousehold.publicToken : "");
  const routeInviteToken = route.page === "join" ? route.invite : "";
  const isRouteAllowedWithoutHousehold =
    route.page === "menu" ||
    route.page === "join" ||
    route.page === "legal" ||
    route.page === "release-readiness" ||
    route.page === "health";
  const supabaseWriteMode = detectSupabaseWriteMode({
    hasAuthenticatedUser: auth.isAuthenticated,
    hasMigratedHousehold: Boolean(supabaseReadState),
    readsEnabled: isSupabaseReadThroughEnabled,
    writesEnabled: isSupabaseWriteThroughEnabled,
  });
  const isUsingSupabaseReadState =
    (dataSourceMode === "supabase-readonly" || dataSourceMode === "supabase-readwrite") && Boolean(supabaseReadState);
  const allFlowersIncludingRemoved = useMemo(
    () =>
      isUsingSupabaseReadState
        ? supabaseReadState?.allFlowers ?? []
        : shouldUseSupabaseAccountData
          ? []
          : legacyAllFlowersIncludingRemoved,
    [isUsingSupabaseReadState, legacyAllFlowersIncludingRemoved, shouldUseSupabaseAccountData, supabaseReadState?.allFlowers],
  );
  const allFlowers = useMemo(
    () =>
      isUsingSupabaseReadState
        ? (supabaseReadState?.allFlowers ?? []).filter((flower) => !(supabaseReadState?.removedFlowerIds ?? []).includes(flower.id))
        : shouldUseSupabaseAccountData
          ? []
          : legacyAllFlowers,
    [
      isUsingSupabaseReadState,
      legacyAllFlowers,
      shouldUseSupabaseAccountData,
      supabaseReadState?.allFlowers,
      supabaseReadState?.removedFlowerIds,
    ],
  );
  const records = isUsingSupabaseReadState ? supabaseReadState?.records ?? {} : shouldUseSupabaseAccountData ? {} : legacyRecords;
  const diagnostics = isUsingSupabaseReadState ? supabaseReadState?.diagnostics ?? [] : shouldUseSupabaseAccountData ? [] : legacyDiagnostics;
  const householdDisplayName =
    supabaseReadState?.household.name ?? (!shouldUseSupabaseAccountData ? activeHousehold?.name : null) ?? t("household.defaultName");
  const isSupabaseHouseholdPending =
    shouldUseSupabaseAccountData &&
    !supabaseReadState &&
    (auth.loading ||
      (auth.isAuthenticated &&
        (householdLookupStatus !== "complete" || previousAuthUserIdRef.current !== (auth.user?.id ?? null))));
  const flowerById = useMemo(
    () => new Map(allFlowersIncludingRemoved.map((flower) => [flower.id, flower])),
    [allFlowersIncludingRemoved],
  );
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [route.page, "flowerId" in route ? route.flowerId : ""]);

  useEffect(() => {
    if (route.page === "detail") {
      const flower = flowerById.get(route.flowerId);
      document.title = pageTitle(flower?.displayName ?? t("detail.title"));
      return;
    }

    if (route.page === "qr") {
      document.title = pageTitle(t("qr.heading"));
      return;
    }

    if (route.page === "diagnose") {
      document.title = pageTitle(t("diagnosis.heading"));
      return;
    }

    if (route.page === "join") {
      document.title = pageTitle("Join household");
      return;
    }

    if (route.page === "menu") {
      document.title = pageTitle("Menu");
      return;
    }

    if (route.page === "legal" || route.page === "release-readiness" || route.page === "health") {
      document.title = pageTitle(route.page === "health" ? "Health" : route.page === "release-readiness" ? "Readiness" : "Compliance");
      return;
    }

    document.title = pageTitle(t("dashboard.hero"));
  }, [flowerById, route.page, "flowerId" in route ? route.flowerId : "", t]);

  useEffect(() => {
    window.localStorage.setItem(diagnosticsStorageKey, JSON.stringify(legacyDiagnostics));
  }, [legacyDiagnostics]);

  useEffect(() => {
    if (auth.loading) {
      return;
    }

    const nextUserId = auth.user?.id ?? null;
    if (previousAuthUserIdRef.current === nextUserId) {
      return;
    }

    previousAuthUserIdRef.current = nextUserId;
    setSupabaseReadState(null);
    setSupabaseReadError(false);
    setSupabasePlantIdsByLegacyId({});
    setHouseholdInvites([]);
    setHouseholdMembers([]);

    if (nextUserId && isSupabaseBackend) {
      setHouseholdLookupStatus("checking");
      setIsAccessChecking(true);
      clearHouseholdSession();
      setActiveHousehold(null);
      setPreviousHousehold(null);
      setCloudSyncEnabled(false);
      setCloudSyncReady(false);
      setAccessStatus("");
    } else {
      setHouseholdLookupStatus("complete");
    }
  }, [auth.loading, auth.user?.id]);

  useEffect(() => {
    if (activeHousehold || supabaseReadState) {
      markOnboardingComplete(window.localStorage);
      setOnboardingStep("complete");
    }
  }, [activeHousehold, supabaseReadState]);

  useEffect(() => {
    if (
      !isSupabaseHouseholdPending &&
      !auth.loading &&
      auth.isAuthenticated &&
      onboardingStep === "welcome" &&
      !activeHousehold &&
      !supabaseReadState
    ) {
      setOnboardingStep("household");
    }
  }, [activeHousehold, auth.isAuthenticated, auth.loading, isSupabaseHouseholdPending, onboardingStep, supabaseReadState]);

  useEffect(() => {
    if (auth.loading || !auth.isAuthenticated) {
      return;
    }

    setAccountActionStatus("");
    setAccessStatus("");
    setOnboardingStatus("");

    const pendingInvite = window.localStorage.getItem(pendingInviteStorageKey);
    if (!pendingInvite && inviteStatus === t("household.inviteStatusAuthRequired")) {
      setInviteStatus("");
    }
  }, [auth.isAuthenticated, auth.loading, inviteStatus, t]);

  useEffect(() => {
    if (!deleteAccountContact && auth.user?.email) {
      setDeleteAccountContact(auth.user.email);
    }
  }, [auth.user?.email, deleteAccountContact]);

  useEffect(() => {
    if (!routeInviteToken) {
      return;
    }

    const token = normalizeInviteTokenInput(routeInviteToken);
    setJoinInviteInput(token);
    if (!auth.loading && !auth.isAuthenticated && token) {
      window.localStorage.setItem(pendingInviteStorageKey, token);
      setInviteStatus(t("household.inviteStatusAuthRequired"));
      setOnboardingStep("welcome");
    }
  }, [auth.isAuthenticated, auth.loading, routeInviteToken, t]);

  useEffect(() => {
    if (auth.loading || !auth.isAuthenticated) {
      return;
    }

    const pendingInvite = window.localStorage.getItem(pendingInviteStorageKey);
    if (!pendingInvite) {
      return;
    }

    void handleJoinInvite(pendingInvite);
  }, [auth.isAuthenticated, auth.loading]);

  useEffect(() => {
    if (!auth.isAuthenticated || !activeSupabaseHouseholdId) {
      setHouseholdInvites([]);
      setHouseholdMembers([]);
      return;
    }

    void Promise.all([
      refreshHouseholdInvites().catch(() => {
        setHouseholdInvites([]);
      }),
      listHouseholdMembers(activeSupabaseHouseholdId)
        .then(setHouseholdMembers)
        .catch(() => {
          setHouseholdMembers([]);
        }),
    ]);
  }, [activeSupabaseHouseholdId, auth.isAuthenticated]);

  useEffect(() => {
    if (route.page !== "health") {
      return;
    }

    let cancelled = false;
    setHealthEndpointStatus("checking");
    if (isSupabaseBackend) {
      setHealthEndpointStatus("supabase backend selected");
      return () => {
        cancelled = true;
      };
    }

    void fetch("/.netlify/functions/health")
      .then((response) => {
        if (!cancelled) {
          setHealthEndpointStatus(response.ok ? "reachable" : `returned ${response.status}`);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHealthEndpointStatus("not reachable in this runtime");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [route.page]);

  useEffect(
    () => () => {
      if (newPlantImage?.previewUrl) {
        URL.revokeObjectURL(newPlantImage.previewUrl);
      }
    },
    [newPlantImage?.previewUrl],
  );

  useEffect(
    () => () => {
      if (diagnosisImagePreviewUrl) {
        URL.revokeObjectURL(diagnosisImagePreviewUrl);
      }
    },
    [diagnosisImagePreviewUrl],
  );

  useEffect(() => {
    if (!quickRecordStatus) {
      return;
    }

    const timeoutId = window.setTimeout(() => setQuickRecordStatus(""), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [quickRecordStatus]);

  const refreshSupabaseReadState = async () => {
    if (!isSupabaseReadThroughEnabled || !auth.isAuthenticated) {
      return null;
    }

    const nextState = await loadSupabaseReadThroughState(activeHousehold);
    setSupabaseReadState(nextState);
    setSupabaseReadError(false);
    if (nextState) {
      setSupabasePlantIdsByLegacyId((current) =>
        areStringRecordsEqual(current, nextState.supabasePlantIdsByLegacyId) ? current : nextState.supabasePlantIdsByLegacyId,
      );
    }

    return nextState;
  };

  const writeSupabaseFirst = async <T,>(
    operation: () => Promise<T>,
    mirrorLegacy: () => void,
    fallbackMessage = "Supabase write failed. Saved to legacy storage for rollback.",
  ) => {
    if (supabaseWriteMode !== "supabase-first") {
      if (isSupabaseOnlyDataMode) {
        setSupabaseReadError(true);
        return false;
      }
      mirrorLegacy();
      return false;
    }

    if (isSupabaseOnlyDataMode) {
      try {
        await runRequiredSupabaseWrite(operation);
        await refreshSupabaseReadState();
        return true;
      } catch {
        setSupabaseReadError(true);
        return false;
      }
    }

    const result = await runSupabaseWrite(operation);
    mirrorLegacy();

    if (result.mode === "fallback") {
      setSupabaseReadError(true);
      return false;
    }


    try {
      await refreshSupabaseReadState();
    } catch {
      setSupabaseReadError(true);
    }

    return true;
  };

  useEffect(() => {
    if (!isSupabaseReadThroughEnabled || auth.loading || !auth.isAuthenticated) {
      setSupabaseReadState(null);
      setSupabaseReadError(false);
      return;
    }

    let cancelled = false;

    const loadReadThroughState = async () => {
      try {
        const nextState = await loadSupabaseReadThroughState(activeHousehold);
        if (!cancelled) {
          setSupabaseReadState(nextState);
          setSupabaseReadError(false);
          if (nextState) {
            setSupabasePlantIdsByLegacyId((current) =>
              areStringRecordsEqual(current, nextState.supabasePlantIdsByLegacyId) ? current : nextState.supabasePlantIdsByLegacyId,
            );
          }
        }
      } catch {
        if (!cancelled) {
          setSupabaseReadState(null);
          setSupabaseReadError(true);
        }
      }
    };

    void loadReadThroughState();

    return () => {
      cancelled = true;
    };
  }, [activeHousehold, auth.isAuthenticated, auth.loading, auth.user?.id]);

  useEffect(() => {
    if (!auth.isAuthenticated || !activeHousehold) {
      setSupabasePlantIdsByLegacyId({});
      return;
    }

    let cancelled = false;

    const loadSupabaseLinkedPlants = async () => {
      try {
        const households = await getUserHouseholds();
        const household = households.find((item) => item.legacyPublicToken === activeHousehold.publicToken) ?? households[0];
        if (!household) {
          return;
        }

        const entries = await Promise.all(
          allFlowers.map(async (flower) => {
            const plant = await getHouseholdPlantByLegacyId(household.id, flower.id);
            return plant ? ([flower.id, plant.id] as const) : null;
          }),
        );

        if (!cancelled) {
          const nextPlantIdsByLegacyId = Object.fromEntries(entries.filter((entry): entry is [string, string] => Boolean(entry)));
          setSupabasePlantIdsByLegacyId((current) =>
            areStringRecordsEqual(current, nextPlantIdsByLegacyId) ? current : nextPlantIdsByLegacyId,
          );
        }
      } catch {
        if (!cancelled) {
          setSupabasePlantIdsByLegacyId({});
        }
      }
    };

    void loadSupabaseLinkedPlants();

    return () => {
      cancelled = true;
    };
  }, [activeHousehold, allFlowers, auth.isAuthenticated, auth.user?.id]);

  useEffect(() => {
    if (!auth.isAuthenticated) {
      return;
    }

    const supabasePlantIds = Object.values(supabasePlantIdsByLegacyId);
    if (supabasePlantIds.length === 0) {
      return;
    }

    let cancelled = false;

    const loadSupabaseDiagnostics = async () => {
      try {
        const supabaseDiagnostics = (await Promise.all(supabasePlantIds.map((plantId) => getPlantDiagnostics(plantId)))).flat();
        if (cancelled || supabaseDiagnostics.length === 0) {
          return;
        }

        setDiagnostics((current) => {
          const byId = new Map(current.map((diagnostic) => [diagnostic.id, diagnostic]));
          for (const diagnostic of supabaseDiagnostics) {
            const legacyPlantId = Object.entries(supabasePlantIdsByLegacyId).find(([, plantId]) => plantId === diagnostic.plantId)?.[0];
            if (!legacyPlantId) {
              continue;
            }

            byId.set(diagnostic.id, {
              ...diagnostic,
              imageDataUrl: "",
              imagePath: diagnostic.imagePath ?? undefined,
              plantId: legacyPlantId,
              storageMode: "supabase",
            });
          }

          return [...byId.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        });
      } catch {
        // Supabase history is additive. Legacy local history remains the source of truth when it cannot be loaded.
      }
    };

    void loadSupabaseDiagnostics();

    return () => {
      cancelled = true;
    };
  }, [auth.isAuthenticated, auth.user?.id, supabasePlantIdsByLegacyId]);

  useEffect(() => {
    let cancelled = false;

    const resolveHousehold = async () => {
      const urlToken = getHouseholdTokenFromUrl();
      const storedHousehold = getStoredHouseholdSession();
      const token = urlToken || storedHousehold?.publicToken || "";

      if (!token && (!isSupabaseBackend || !auth.isAuthenticated)) {
        setActiveHousehold(null);
        setAccessStatus("");
        setIsAccessChecking(false);
        setHouseholdLookupStatus("complete");
        return;
      }

      try {
        setHouseholdLookupStatus("checking");
        setIsAccessChecking(true);
        let household: HouseholdSession | null = null;

        if (isSupabaseBackend && auth.isAuthenticated) {
          const households = await getUserHouseholds();
          const supabaseHousehold =
            (token ? households.find((item) => item.id === token || item.legacyPublicToken === token) : null) ?? households[0] ?? null;
          if (!supabaseHousehold) {
            if (!cancelled) {
              clearHouseholdSession();
              setActiveHousehold(null);
              setSupabaseReadState(null);
              setBaseUrl(currentBaseUrl());
              setAccessStatus("");
              setIsAccessChecking(false);
              setHouseholdLookupStatus("complete");
            }
            return;
          }
          household = supabaseHousehold ? { name: supabaseHousehold.name, publicToken: supabaseHousehold.id } : null;
        } else if (storedHousehold?.publicToken === token) {
          household = storedHousehold;
        } else if (isLegacyNetlifyBackendEnabled) {
          const response = await fetch(createHouseholdApiUrl("/.netlify/functions/household-access", token));
          if (!response.ok) {
            throw new Error("Household access failed.");
          }

          const data = (await response.json()) as { household?: HouseholdSession };
          household = data.household ?? null;
        }

        if (!household || !isValidHouseholdToken(household.publicToken)) {
          throw new Error("Invalid household response.");
        }

        if (cancelled) {
          return;
        }

        storeHouseholdSession(household);
        setActiveHousehold(household);
        setBaseUrl(currentHouseholdBaseUrl(household.publicToken));
        setAccessStatus("");
        setHouseholdLookupStatus("complete");
      } catch {
        if (!cancelled) {
          clearHouseholdSession();
          setActiveHousehold(null);
          setCloudSyncEnabled(false);
          setAccessStatus(t("household.linkInvalid"));
          setHouseholdLookupStatus("complete");
        }
      } finally {
        if (!cancelled) {
          setIsAccessChecking(false);
        }
      }
    };

    void resolveHousehold();

    return () => {
      cancelled = true;
    };
  }, [auth.isAuthenticated, auth.user?.id, t]);

  useEffect(() => {
    if (!activeHousehold || !isLegacyNetlifyBackendEnabled || supabaseWriteMode === "supabase-first") {
      setCloudSyncReady(false);
      return;
    }

    let cancelled = false;

    const loadCloudState = async () => {
      try {
        setCloudSyncReady(false);
        const [settingsResponse, recordsResponse] = await Promise.all([
          fetch(createHouseholdApiUrl("/.netlify/functions/report-settings", activeHousehold.publicToken)),
          fetch(createHouseholdApiUrl("/.netlify/functions/plant-state", activeHousehold.publicToken)),
        ]);

        if (!settingsResponse.ok || !recordsResponse.ok) {
          throw new Error("Cloud sync is not available on this host.");
        }

        const settings = (await settingsResponse.json()) as { recipient?: string };
        const cloudState = (await recordsResponse.json()) as {
          customFlowers?: Flower[];
          diagnostics?: PlantDiagnosticEntry[];
          records?: FlowerRecords;
          removedFlowerIds?: string[];
        };

        if (cancelled) {
          return;
        }

        setReportRecipient(typeof settings.recipient === "string" ? settings.recipient : "");
        const cloudCustomFlowers = Array.isArray(cloudState.customFlowers) ? cloudState.customFlowers : [];
        const cloudRemovedFlowerIds = Array.isArray(cloudState.removedFlowerIds) ? cloudState.removedFlowerIds : [];
        replaceCustomFlowers(cloudCustomFlowers.length > 0 ? cloudCustomFlowers : customFlowers);
        replaceRemovedFlowerIds(cloudRemovedFlowerIds.length > 0 ? cloudRemovedFlowerIds : removedFlowerIds);
        if (Array.isArray(cloudState.diagnostics) && cloudState.diagnostics.length > 0) {
          setDiagnostics(sanitizeDiagnosticEntries(cloudState.diagnostics));
        }
        if (cloudState.records) {
          replaceRecords(mergeCloudRecords(records, cloudState.records));
        }
        setCloudSyncEnabled(true);
      } catch {
        if (!cancelled) {
          setCloudSyncEnabled(false);
        }
      } finally {
        if (!cancelled) {
          setCloudSyncReady(true);
        }
      }
    };

    void loadCloudState();

    return () => {
      cancelled = true;
    };
  }, [activeHousehold]);

  useEffect(() => {
    if (!isPushNotificationSupported()) {
      setPushStatus(t("push.unsupported"));
      return;
    }

    void navigator.serviceWorker
      .getRegistration()
      .then((registration) => registration?.pushManager.getSubscription() ?? null)
      .then((subscription) => {
        setPushEnabled(Boolean(subscription));
      })
      .catch(() => undefined);
  }, [t]);

  useEffect(() => {
    if (!activeHousehold || !cloudSyncReady || !cloudSyncEnabled || !isLegacyNetlifyBackendEnabled || supabaseWriteMode === "supabase-first") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void fetch(createHouseholdApiUrl("/.netlify/functions/plant-state", activeHousehold.publicToken), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customFlowers,
          diagnostics: legacyDiagnostics,
          householdId: activeHousehold.publicToken,
          records: legacyRecords,
          removedFlowerIds,
        }),
      }).catch(() => undefined);
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [activeHousehold, cloudSyncEnabled, cloudSyncReady, customFlowers, legacyDiagnostics, legacyRecords, removedFlowerIds]);

  const qrLabelValidation = useMemo(
    () => validateQrLabelLayout(createQrLabelLayout(allFlowers, baseUrl)),
    [allFlowers, baseUrl],
  );

  const enablePushNotifications = async () => {
    if (!activeHousehold) {
      setPushStatus(t("push.householdRequired"));
      return;
    }

    try {
      setPushStatus(t("push.enabling"));
      await subscribeToPushNotifications(activeHousehold.publicToken);
      setPushEnabled(true);
      setPushStatus(t("push.enabled"));
    } catch (error) {
      setPushStatus(error instanceof Error ? error.message : t("push.enableFailed"));
    }
  };

  const disablePushNotifications = async () => {
    if (!activeHousehold) {
      setPushStatus(t("push.householdRequired"));
      return;
    }

    try {
      setPushStatus(t("push.disabling"));
      await unsubscribeFromPushNotifications(activeHousehold.publicToken);
      setPushEnabled(false);
      setPushStatus(t("push.disabled"));
    } catch (error) {
      setPushStatus(error instanceof Error ? error.message : t("push.disableFailed"));
    }
  };

  const handleQrPdfExport = async () => {
    if (allFlowers.length === 0) {
      setQrExportStatus(t("qr.noPlantsExport"));
      return;
    }

    try {
      setQrExportStatus(t("qr.exportGenerating"));
      await exportQrLabelsPdf(allFlowers, baseUrl);
      setQrExportStatus(t("qr.exportReady"));
    } catch (error) {
      setQrExportStatus(error instanceof Error ? error.message : t("qr.exportFailed"));
    }
  };

  const renderHeroActions = () => (
    <div className="hero-actions">
      <button className="user-menu-trigger" type="button" onClick={() => setIsHouseholdSheetOpen(true)} aria-label={t("household.openMenu")}>
        <span className="user-menu-avatar" aria-hidden="true">
          <UserRound size={19} />
        </span>
        <span className="user-menu-copy">
          <strong>{householdDisplayName}</strong>
          <small>{auth.isAuthenticated ? t("account.household") : t("account.guest")}</small>
        </span>
      </button>
    </div>
  );

  const renderHouseholdSheet = () =>
    isHouseholdSheetOpen ? (
      <div className="modal-backdrop" role="presentation">
        <section className="household-sheet" role="dialog" aria-modal="true" aria-labelledby="household-sheet-title">
          <button className="modal-close" type="button" onClick={() => setIsHouseholdSheetOpen(false)} aria-label={t("action.close")}>
            <X size={20} aria-hidden="true" />
          </button>
          <div className="household-sheet-hero">
            <span className="household-sheet-avatar" aria-hidden="true">
              <Home size={24} />
            </span>
            <div>
              <p className="eyebrow">{t("account.household")}</p>
              <h2 id="household-sheet-title">{householdDisplayName}</h2>
              <span>{auth.isAuthenticated ? t("household.synced") : t("household.localGuest")}</span>
            </div>
          </div>
          <div className="household-sheet-meta" aria-label={t("household.summary")}>
            <a href="#/menu?section=household" onClick={() => setIsHouseholdSheetOpen(false)}>
              <UsersRound size={17} aria-hidden="true" />
              <span>{householdMembers.length > 0 ? t("household.memberCount", { count: householdMembers.length }) : t("household.oneMember")}</span>
              <ChevronRight size={16} aria-hidden="true" />
            </a>
            <div className="household-sheet-meta-tile" aria-label={t("dashboard.tracked", { count: allFlowers.length })}>
              <Leaf size={17} aria-hidden="true" />
              <span>{t("dashboard.tracked", { count: allFlowers.length })}</span>
            </div>
          </div>
          {householdLinkStatus === "copy-failed" ? <p className="report-status">{t("household.copyFailed")}</p> : null}
          <div className="household-sheet-actions">
            <button
              className={householdLinkStatus === "copied" ? "copy-link-action copied" : "copy-link-action"}
              type="button"
              onClick={copyHouseholdLink}
            >
              {householdLinkStatus === "copied" ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
              {householdLinkStatus === "copied" ? t("household.copied") : t("household.copyLink")}
            </button>
            <a href="#/menu?section=household" onClick={() => setIsHouseholdSheetOpen(false)}>
              <Settings size={17} aria-hidden="true" />
              {t("household.settings")}
              <ChevronRight size={16} aria-hidden="true" />
            </a>
          </div>
        </section>
      </div>
    ) : null;

  const updateCareRecord = async (flowerId: string, patch: Partial<FlowerRecords[string]>, message = "") => {
    const supabasePlantId = supabasePlantIdsByLegacyId[flowerId];
    if (supabaseWriteMode === "supabase-first" && supabasePlantId) {
      await writeSupabaseFirst(
        () => updateSupabaseCareRecord(supabasePlantId, patch),
        () => updateRecord(flowerId, patch),
        t("sync.careWriteFallback"),
      );
    } else if (isSupabaseOnlyDataMode) {
      setSupabaseReadError(true);
      setQuickRecordStatus(t("sync.plantUnavailable"));
    } else {
      updateRecord(flowerId, patch);
    }

    if (message) {
      setQuickRecordStatus(message);
    }
  };

  const saveQuickRecord = (flowerId: string, patch: Partial<FlowerRecords[string]>, message: string) => {
    void updateCareRecord(flowerId, patch, message);
  };

  const saveFlower = async (flower: Flower, message = "") => {
    if (supabaseWriteMode === "supabase-first" && supabaseReadState) {
      const result = await writeSupabaseFirst(
        () => upsertSupabasePlantFromFlower(supabaseReadState.household.id, flower),
        () => updateFlower(flower),
        t("sync.plantWriteFallback"),
      );
      if (result && message) {
        setQuickRecordStatus(message);
      }
      return;
    }

    if (isSupabaseOnlyDataMode) {
      setSupabaseReadError(true);
      setQuickRecordStatus(t("sync.householdUnavailable"));
      return;
    }

    updateFlower(flower);
    if (message) {
      setQuickRecordStatus(message);
    }
  };

  const addFlower = async (flower: Flower) => {
    if (supabaseWriteMode === "supabase-first" && supabaseReadState) {
      await writeSupabaseFirst(
        () => upsertSupabasePlantFromFlower(supabaseReadState.household.id, flower),
        () => addCustomFlower(flower),
        t("sync.customPlantFallback"),
      );
      return;
    }

    if (isSupabaseOnlyDataMode) {
      setSupabaseReadError(true);
      setNewPlantStatus(t("sync.customPlantUnavailable"));
      return;
    }

    addCustomFlower(flower);
  };

  const removeFlowerById = async (flowerId: string) => {
    if (supabaseWriteMode === "supabase-first" && supabaseReadState) {
      await writeSupabaseFirst(
        () => setSupabasePlantRemoved(supabaseReadState.household.id, flowerId, true),
        () => removeFlower(flowerId),
        t("sync.removeFallback"),
      );
      return;
    }

    if (isSupabaseOnlyDataMode) {
      setSupabaseReadError(true);
      setQuickRecordStatus(t("sync.removeUnavailable"));
      return;
    }

    removeFlower(flowerId);
  };

  const refreshHouseholdInvites = async () => {
    if (!auth.isAuthenticated || !activeSupabaseHouseholdId) {
      setHouseholdInvites([]);
      return;
    }

    const invites = await listHouseholdInvites(activeSupabaseHouseholdId);
    setHouseholdInvites(invites);
  };

  const setInviteFeedback = (message: string, tone: "error" | "info" | "success" = "info") => {
    setInviteStatusTone(tone);
    setInviteStatus(message);
  };

  const handleCreateInvite = async () => {
    if (!auth.isAuthenticated) {
      setInviteFeedback(t("household.inviteStatusNotSignedIn"), "error");
      setOnboardingStep("welcome");
      return;
    }

    if (!activeSupabaseHouseholdId) {
      setInviteFeedback(t("household.inviteStatusNoHousehold"), "error");
      return;
    }

    const normalizedEmail = normalizeInviteEmail(inviteEmail);
    if (!isValidInviteEmail(normalizedEmail)) {
      setInviteFeedback(t("household.inviteStatusInvalidEmail"), "error");
      return;
    }

    const inviteExpiresAtDate = inviteExpiresAt ? new Date(inviteExpiresAt) : null;
    if (inviteExpiresAtDate && Number.isNaN(inviteExpiresAtDate.getTime())) {
      setInviteFeedback(t("household.inviteStatusInvalidDate"), "error");
      return;
    }

    if (inviteExpiresAtDate && inviteExpiresAtDate.getTime() <= Date.now()) {
      setInviteFeedback(t("household.inviteStatusExpiry"), "error");
      return;
    }

    const inviteExpiresAtIso = inviteExpiresAtDate ? inviteExpiresAtDate.toISOString() : null;

    if (householdInvites.some((invite) => isActiveInvite(invite) && invite.inviteeEmail === normalizedEmail)) {
      setInviteFeedback(t("household.inviteStatusDuplicate"), "error");
      return;
    }

    try {
      setInviteFeedback(t("household.inviteStatusCreating"), "info");
      const invite = await createHouseholdInvite(
        activeSupabaseHouseholdId,
        normalizedEmail,
        inviteRole,
        inviteExpiresAtIso,
      );
      const link = createInviteUrl(invite.token);
      setCreatedInviteLink(link);
      setInviteEmail("");
      await refreshHouseholdInvites();
      try {
        await sendHouseholdInviteEmail({
          householdId: activeSupabaseHouseholdId,
          householdName: householdDisplayName,
          inviteUrl: link,
          recipientEmail: normalizedEmail,
          role: inviteRole,
        });
        setInviteFeedback(t("household.inviteStatusSent", { email: normalizedEmail }), "success");
      } catch {
        setInviteFeedback(t("household.inviteStatusEmailFailed", { email: normalizedEmail }), "error");
      }
    } catch (error) {
      const debugMessage = safeInviteDebugMessage(error);
      setInviteFeedback(`${t(inviteErrorMessage(error))}${debugMessage ? ` (${debugMessage})` : ""}`, "error");
    }
  };

  const handleCopyInviteLink = async () => {
    if (!createdInviteLink) {
      return;
    }

    try {
      await navigator.clipboard.writeText(createdInviteLink);
      setInviteStatus(t("household.inviteCopied"));
    } catch {
      setInviteStatus(createdInviteLink);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      await revokeHouseholdInvite(inviteId);
      setInviteStatus(t("household.inviteRevoked"));
      await refreshHouseholdInvites();
    } catch (error) {
      setInviteStatus(error instanceof Error ? error.message : t("household.inviteRevokeFailed"));
    }
  };

  const declinePendingInvite = () => {
    window.localStorage.removeItem(pendingInviteStorageKey);
    setJoinInviteInput("");
    setInviteStatus(t("household.inviteDeclined"));
    window.location.hash = "#/menu";
  };

  const handleAccountSignOut = async () => {
    if (!window.confirm(t("account.signOutConfirm"))) {
      return;
    }

    try {
      setAccountActionStatus(t("account.signingOut"));
      await signOut();
      clearHouseholdSession();
      setActiveHousehold(null);
      setSupabaseReadState(null);
      setAccountActionStatus(t("account.signedOut"));
    } catch (error) {
      setAccountActionStatus(error instanceof Error ? error.message : t("account.signOutFailed"));
    }
  };

  const handleJoinInvite = async (input = joinInviteInput) => {
    const token = normalizeInviteTokenInput(input);
    if (!token || !isLikelyInviteToken(token)) {
      setInviteStatus(t(token ? "household.inviteStatusInvalidOrExpired" : "household.inviteStatusMissingToken"));
      return false;
    }

    if (!auth.isAuthenticated) {
      window.localStorage.setItem(pendingInviteStorageKey, token);
      setJoinInviteInput(token);
      setInviteStatus(t("household.inviteStatusAuthRequired"));
      setOnboardingStep("welcome");
      return false;
    }

    try {
      setInviteStatus(t("household.joining"));
      const household = await joinHouseholdByInvite(token);
      const session = { name: household.name, publicToken: household.id };
      storeHouseholdSession(session);
      window.localStorage.removeItem(pendingInviteStorageKey);
      setActiveHousehold(session);
      setBaseUrl(currentHouseholdBaseUrl(session.publicToken));
      setInviteStatus(t("household.joined"));
      window.history.replaceState(null, "", createHouseholdUrl(session.publicToken));
      await refreshSupabaseReadState().catch(() => null);
      return true;
    } catch (error) {
      setInviteStatus(t(joinInviteErrorMessage(error)));
      return false;
    }
  };

  const handleCreateHousehold = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isCreatingHousehold) {
      return false;
    }

    if (!auth.isAuthenticated) {
      setAccessStatus(t("household.createRequiresAuth"));
      setOnboardingStep("welcome");
      return false;
    }

    try {
      setIsCreatingHousehold(true);
      setAccessStatus(t("household.creating"));
      let household: HouseholdSession;

      if (auth.isAuthenticated && isSupabaseBackend) {
        const created = await createHousehold(householdNameDraft);
        household = { name: created.name, publicToken: created.id };
      } else if (isLegacyNetlifyBackendEnabled) {
        const response = await fetch("/.netlify/functions/household-access", {
          body: JSON.stringify({ name: householdNameDraft }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });

        if (!response.ok) {
          throw new Error(t("household.createFailed"));
        }

        const data = (await response.json()) as { household?: HouseholdSession };
        if (!data.household) {
          throw new Error(t("household.invalidResponse"));
        }
        household = data.household;
      } else {
        throw new Error(t("household.createRequiresAuth"));
      }

      if (!isValidHouseholdToken(household.publicToken)) {
        throw new Error(t("household.invalidResponse"));
      }

      storeHouseholdSession(household);
      window.history.replaceState(null, "", createHouseholdUrl(household.publicToken));
      setActiveHousehold(household);
      setBaseUrl(currentHouseholdBaseUrl(household.publicToken));
      setAccessStatus("");
      return true;
    } catch {
      setAccessStatus(t("household.createFailedRetry"));
      return false;
    } finally {
      setIsCreatingHousehold(false);
      setIsAccessChecking(false);
    }
  };

  const copyHouseholdLink = async () => {
    if (!activeHousehold) {
      return;
    }

    const link = createHouseholdUrl(activeHousehold.publicToken);
    try {
      await navigator.clipboard.writeText(link);
      setHouseholdLinkStatus("copied");
      window.setTimeout(() => setHouseholdLinkStatus(""), 2200);
    } catch {
      setHouseholdLinkStatus("copy-failed");
    }
  };

  const changeHousehold = () => {
    if (activeHousehold) {
      setPreviousHousehold(activeHousehold);
    }
    clearHouseholdSession();
    removeHouseholdFromCurrentUrl();
    setActiveHousehold(null);
    setCloudSyncEnabled(false);
    setCloudSyncReady(false);
    setAccessStatus("");
  };

  const restorePreviousHousehold = () => {
    if (!previousHousehold) {
      return;
    }

    storeHouseholdSession(previousHousehold);
    window.history.replaceState(null, "", createHouseholdUrl(previousHousehold.publicToken));
    setActiveHousehold(previousHousehold);
    setBaseUrl(currentHouseholdBaseUrl(previousHousehold.publicToken));
    setPreviousHousehold(null);
    setAccessStatus("");
  };

  const filteredFlowers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return allFlowers;
    }

    return allFlowers.filter((flower) =>
      [flower.displayName, flower.likelyName, flower.shortCare].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      ),
    );
  }, [allFlowers, query]);

  const plantPageSize = 10;
  const plantPageCount = Math.max(1, Math.ceil(filteredFlowers.length / plantPageSize));
  const visibleFlowers = filteredFlowers.slice((plantPage - 1) * plantPageSize, plantPage * plantPageSize);

  useEffect(() => {
    setPlantPage(1);
  }, [query, allFlowers.length]);

  useEffect(() => {
    setPlantPage((currentPage) => Math.min(currentPage, plantPageCount));
  }, [plantPageCount]);

  const handleAddCustomFlower = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const plantName = newPlantName.trim();

    if (!plantName || !newPlantImage) {
      setNewPlantStatus(t("plantForm.nameAndImageRequired"));
      return;
    }

    setIsAddingPlant(true);
    setNewPlantStatus(t("image.validatingSafety"));

    try {
      const imageDataUrl = newPlantImage.dataUrl;
      await validatePlantImageForUpload(imageDataUrl);
      setNewPlantStatus(t("plantForm.generatingCare"));
      const care = await fetchGeneratedCare(plantName, imageDataUrl);
      const { displayName: aiCareDisplayName, identificationConfidence, ...careProfile } = care;
      const aiDisplayName = aiCareDisplayName.trim();

      const customFlower: Flower = {
        ...careProfile,
        displayName: aiDisplayName || plantName,
        id: createCustomFlowerId(),
        identification: identificationConfidence,
        image: imageDataUrl,
        source: "custom",
      };

      await addFlower(customFlower);
      setNewPlantStatus(t("plantForm.added", { plant: customFlower.displayName }));
      setNewPlantName("");
      URL.revokeObjectURL(newPlantImage.previewUrl);
      setNewPlantImage(null);
      setIsAddPlantModalOpen(false);
    } catch (error) {
      const reason = error instanceof Error ? error.message : t("plantForm.addFailed");
      setNewPlantStatus(reason === imageUploadRejectionMessage ? reason : t("plantForm.aiFailed", { reason }));
    } finally {
      setIsAddingPlant(false);
    }
  };

  const handleGenerateCarePreview = async (flower: Flower) => {
    setIsGeneratingCarePreview(true);
    setCarePreviewStatus(t("detail.aiCarePreparing"));

    try {
      const imageDataUrl = await imageSourceToDataUrl(flower.image);
      const nextCare = await fetchGeneratedCare(flower.displayName, imageDataUrl);
      setCarePreview({ flowerId: flower.id, nextCare });
      setCarePreviewStatus("");
    } catch (error) {
      const reason = error instanceof Error ? error.message : t("detail.aiCareFailed");
      setCarePreviewStatus(t("detail.aiGenerationFailed", { reason }));
    } finally {
      setIsGeneratingCarePreview(false);
    }
  };

  const confirmCareUpdate = () => {
    if (!carePreview) {
      return;
    }

    const currentFlower = flowerById.get(carePreview.flowerId);
    if (!currentFlower) {
      setCarePreview(null);
      setCarePreviewStatus(t("detail.plantUnavailable"));
      return;
    }

    void saveFlower(applyGeneratedCareToFlower(currentFlower, carePreview.nextCare), t("detail.careUpdated"));
    setCarePreview(null);
    setCarePreviewStatus(t("detail.careUpdated"));
  };

  const startNameEdit = (flower: Flower) => {
    setEditingNameFlowerId(flower.id);
    setDraftFlowerName(flower.displayName);
  };

  const cancelNameEdit = () => {
    setEditingNameFlowerId("");
    setDraftFlowerName("");
  };

  const confirmNameEdit = (flower: Flower) => {
    const nextName = draftFlowerName.trim();
    if (!nextName) {
      return;
    }

    void saveFlower({ ...flower, displayName: nextName, source: "custom" });
    cancelNameEdit();
  };

  const openDiagnosisModal = () => {
    setDiagnosisImageDataUrl("");
    setDiagnosisImagePreviewUrl("");
    setDiagnosisDraft(null);
    setDiagnosisSymptomNotes("");
    setDiagnosisUserNote("");
    setDiagnosisStatus("");
    setIsDiagnosisModalOpen(true);
  };

  const closeDiagnosisModal = () => {
    if (isDiagnosing) {
      return;
    }

    setIsDiagnosisModalOpen(false);
  };

  const handleNewPlantImageCapture = async (source: "camera" | "gallery", file?: File) => {
    let capturedImage: NormalizedImage | null = null;
    try {
      setNewPlantStatus(t("image.processing"));
      const image = await captureImage({ file, source });
      capturedImage = image;
      setNewPlantStatus(t("image.validatingPlant"));
      await validatePlantImageForUpload(image.dataUrl);
      if (newPlantImage?.previewUrl) {
        URL.revokeObjectURL(newPlantImage.previewUrl);
      }
      setNewPlantImage(image);
      setNewPlantStatus(t("image.ready"));
    } catch (error) {
      if (capturedImage?.previewUrl) {
        URL.revokeObjectURL(capturedImage.previewUrl);
      }
      setNewPlantImage(null);
      setNewPlantStatus(error instanceof Error ? error.message : t("image.processFailed"));
    }
  };

  const handleDiagnosisImageChange = async (source: "camera" | "gallery", file?: File) => {
    if (!file && source === "gallery") {
      return;
    }

    let capturedImage: NormalizedImage | null = null;
    try {
      setDiagnosisStatus(t("image.processing"));
      setDiagnosisDraft(null);
      const image = await captureImage({ file, source });
      capturedImage = image;
      setDiagnosisStatus(t("image.validatingPlant"));
      await validatePlantImageForUpload(image.dataUrl);
      if (diagnosisImagePreviewUrl) {
        URL.revokeObjectURL(diagnosisImagePreviewUrl);
      }
      setDiagnosisImageDataUrl(image.dataUrl);
      setDiagnosisImagePreviewUrl(image.previewUrl);
      setDiagnosisStatus(t("diagnosis.imageReady"));
    } catch (error) {
      if (capturedImage?.previewUrl) {
        URL.revokeObjectURL(capturedImage.previewUrl);
      }
      if (diagnosisImagePreviewUrl) {
        URL.revokeObjectURL(diagnosisImagePreviewUrl);
      }
      setDiagnosisImageDataUrl("");
      setDiagnosisImagePreviewUrl("");
      setDiagnosisStatus(error instanceof Error ? error.message : t("image.processFailed"));
    }
  };

  const runPlantDiagnosis = async (flower: Flower) => {
    if (!diagnosisImageDataUrl || isDiagnosing) {
      return;
    }

    setIsDiagnosing(true);
    setDiagnosisStatus(t("diagnosis.checkingPremium"));

    try {
      setDiagnosisStatus(t("image.validatingSafety"));
      await validatePlantImageForUpload(diagnosisImageDataUrl);

      const gate = await checkDiagnosisGate({
        isAuthenticated: auth.isAuthenticated,
        wasLegacyDiagnosisAvailable: true,
      });

      if (!gate.allowed) {
        setDiagnosisUpgradeReason(gate.message);
        setDiagnosisStatus(gate.message);
        return;
      }

      setDiagnosisStatus(t("diagnosis.aiAnalyzing"));
      const diagnosis = await fetchPlantDiagnosis(flower.displayName, diagnosisImageDataUrl, diagnosisSymptomNotes);
      setDiagnosisDraft(diagnosis);
      await recordDiagnosisUsage(gate.mode);
      setDiagnosisStatus(diagnosis.confidence < 45 ? t("diagnosis.lowConfidence") : "");
    } catch (error) {
      setDiagnosisDraft(null);
      setDiagnosisStatus(error instanceof Error ? error.message : t("diagnosis.failed"));
    } finally {
      setIsDiagnosing(false);
    }
  };

  const savePlantDiagnosis = async (flower: Flower, userConfirmation: DiagnosisConfirmation) => {
    if (!diagnosisDraft || !diagnosisImageDataUrl || !flowerById.has(flower.id)) {
      setDiagnosisStatus(t("diagnosis.saveUnavailable"));
      return;
    }

    const now = new Date().toISOString();
    const sanitizedNote = sanitizeDiagnosticNote(diagnosisUserNote);
    const supabasePlantId = supabasePlantIdsByLegacyId[flower.id];
    let supabaseImagePath = "";
    let supabaseDiagnosticId = "";

    if (supabaseWriteMode === "supabase-first" && supabasePlantId) {
      try {
        const legacyDiagnosisId = createDiagnosticId();
        const saved = await createSupabaseDiagnosis({
          diagnosis: diagnosisDraft,
          imageDataUrl: diagnosisImageDataUrl,
          legacyId: legacyDiagnosisId,
          plantId: supabasePlantId,
          userConfirmation,
          userNote: sanitizedNote,
        });
        supabaseImagePath = saved.imagePath ?? "";
        supabaseDiagnosticId = saved.id;
      } catch {
        if (isSupabaseOnlyDataMode) {
          setSupabaseReadError(true);
          setDiagnosisStatus("Supabase diagnosis save failed. Diagnosis was not saved.");
          return;
        }
        setDiagnosisStatus("Supabase diagnosis save failed. Saving diagnosis locally for backward compatibility.");
      }
    } else if (isSupabaseOnlyDataMode) {
      setSupabaseReadError(true);
      setDiagnosisStatus("Supabase plant is not available. Diagnosis was not saved.");
      return;
    }

    const entry: PlantDiagnosticEntry = {
      ...diagnosisDraft,
      createdAt: now,
      id: supabaseDiagnosticId || createDiagnosticId(),
      imageDataUrl: supabaseImagePath ? "" : diagnosisImageDataUrl,
      imagePath: supabaseImagePath || undefined,
      plantId: flower.id,
      storageMode: supabaseImagePath ? "supabase" : "local",
      updatedAt: now,
      userConfirmation,
      userNote: sanitizedNote,
    };

    setDiagnostics((current) => [entry, ...current.filter((diagnostic) => diagnostic.id !== entry.id)]);
    setIsDiagnosisModalOpen(false);
  };

  const updateDiagnosticHistoryEntry = async (diagnosticId: string, patch: Partial<Pick<PlantDiagnosticEntry, "userConfirmation" | "userNote">>) => {
    const sanitizedPatch = {
      ...patch,
      ...(patch.userNote !== undefined ? { userNote: sanitizeDiagnosticNote(patch.userNote) } : {}),
    };

    setDiagnostics((current) =>
      current.map((diagnostic) =>
        diagnostic.id === diagnosticId
          ? {
              ...diagnostic,
              ...sanitizedPatch,
              updatedAt: new Date().toISOString(),
            }
          : diagnostic,
      ),
    );

    const diagnostic = diagnostics.find((item) => item.id === diagnosticId);
    if (diagnostic?.storageMode === "supabase" && supabaseWriteMode === "supabase-first") {
      try {
        await updateSupabaseDiagnosis(diagnosticId, sanitizedPatch);
        await refreshSupabaseReadState();
      } catch {
        setDiagnosisStatus(t("sync.diagnosisFallback"));
      }
    }
  };

  const confirmRemoveCustomFlower = () => {
    if (!deleteFlowerId) {
      return;
    }

    void removeFlowerById(deleteFlowerId);
    setDeleteFlowerId("");
    window.location.hash = "#/";
  }

  const requestAccountDeletion = async () => {
    const contact = deleteAccountContact.trim();
    if (!contact) {
      setDeleteAccountStatus("Enter the account email or user ID before requesting deletion review.");
      return;
    }

    setDeleteAccountStatus("Submitting deletion review request...");
    try {
      const body = await callBackendFunction<{ message?: string }>({
        allowNetlifyFallback: true,
        body: {
          contact,
          userId: auth.user?.id ?? null,
        },
        functionName: "delete-account-request",
        netlifyPath: "/.netlify/functions/delete-account-request",
      });

      setDeleteAccountStatus(body?.message ?? "Deletion request received for manual review.");
    } catch (error) {
      setDeleteAccountStatus(error instanceof Error ? error.message : "Deletion request could not be submitted.");
    }
  };

  const selectOnboardingLanguage = (language: PlantieLanguage) => {
    writeStoredLanguage(window.localStorage, language);
    setSelectedLanguage(language);
    if (onboardingStep !== "complete") {
      setOnboardingStep("welcome");
    }
  };

  const continueToHouseholdSetup = () => {
    setOnboardingStep("household");
  };

  const handleCreateOnboardingHousehold = async (event: FormEvent<HTMLFormElement>) => {
    setIsNewOnboardingHousehold(true);
    const created = await handleCreateHousehold(event);
    if (created) {
      markOnboardingComplete(window.localStorage);
      setOnboardingStep("complete");
    } else {
      setIsNewOnboardingHousehold(false);
    }
  };

  const releaseEnv = {
    viteRevenueCatAndroidKey: import.meta.env.VITE_REVENUECAT_API_KEY_ANDROID,
    viteRevenueCatIosKey: import.meta.env.VITE_REVENUECAT_API_KEY_IOS,
    viteSupabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    viteSupabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  };
  const openAddPlantFromMobileNav = () => {
    setIsAddPlantModalOpen(true);
    if (route.page !== "dashboard") {
      window.location.hash = "#/";
    }
  };
  const navigateBack = (fallbackHash = "#/") => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.hash = fallbackHash;
  };

  if (auth.isPasswordRecovery) {
    return (
      <main className="app-shell access-shell onboarding-shell">
        <section className="access-card onboarding-card" aria-labelledby="password-recovery-title">
          <div className="section-title">
            <KeyRound size={22} aria-hidden="true" />
            <h1 id="password-recovery-title">{t("auth.newPasswordTitle")}</h1>
          </div>
          <p>{t("auth.newPasswordBody")}</p>
          <AuthPanel compact initialMode="updatePassword" language={selectedLanguage} />
        </section>
      </main>
    );
  }

  if (route.page === "join") {
    return (
      <main className="app-shell compact">
        <header className="topbar">
          <a className="icon-link" href="#/menu" onClick={navigateBack("#/menu")} aria-label={t("nav.backToMenu")}>
            <ArrowLeft size={22} aria-hidden="true" />
          </a>
          <div>
            <p className="eyebrow">{t("household.familyInvite")}</p>
            <h1>{t("household.joinTitle")}</h1>
          </div>
        </header>
        <section className="mobile-product-card">
          <h2>{t("household.inviteTitle")}</h2>
          <p>{t("household.inviteJoinBody")}</p>
          <label>
            <span>{t("household.inviteToken")}</span>
            <input value={joinInviteInput} onChange={(event) => setJoinInviteInput(event.target.value)} placeholder="#/join?invite=..." />
          </label>
          {auth.isAuthenticated ? (
            <div className="menu-action-row">
              <button className="primary-action" type="button" onClick={() => void handleJoinInvite()}>
                {t("household.acceptInvite")}
              </button>
              <button className="neutral-action" type="button" onClick={declinePendingInvite}>
                {t("household.declineInvite")}
              </button>
            </div>
          ) : (
            <AuthPanel compact language={selectedLanguage} onSuccess={() => void handleJoinInvite(joinInviteInput)} />
          )}
          {inviteStatus ? <p className="report-status">{inviteStatus}</p> : null}
        </section>
      </main>
    );
  }

  if (route.page === "legal" || route.page === "release-readiness" || route.page === "health") {
    return (
      <main className="app-shell compact">
        <header className="topbar">
          <a className="icon-link" href="#/" onClick={navigateBack("#/")} aria-label={t("nav.backToPlantie")}>
            <ArrowLeft size={22} aria-hidden="true" />
          </a>
          <div>
            <p className="eyebrow">Plantie release</p>
            <h1>{route.page === "health" ? "Health" : route.page === "release-readiness" ? "Readiness" : "Compliance"}</h1>
          </div>
        </header>
        {route.page === "legal" ? (
        <LegalPageView
          deleteRequestStatus={deleteAccountStatus}
          onRequestDeletion={auth.isAuthenticated ? requestAccountDeletion : undefined}
          pageId={route.legalPageId}
          requestEmail={deleteAccountContact}
          setRequestEmail={setDeleteAccountContact}
          />
        ) : route.page === "release-readiness" ? (
          <ReleaseChecklistPage />
        ) : (
          <HealthPage backendStatus={healthEndpointStatus} env={releaseEnv} />
        )}
      </main>
    );
  }

  if (onboardingStep !== "complete" && !activeHousehold && !supabaseReadState) {
    if (onboardingStep === "language") {
      return (
        <main className="app-shell access-shell onboarding-shell">
          <section className="access-card onboarding-card" aria-labelledby="language-title">
            <div className="section-title">
              <Leaf size={22} aria-hidden="true" />
              <h1 id="language-title">{t("onboarding.languageTitle")}</h1>
            </div>
            <p>{t("onboarding.languageBody")}</p>
            <div className="onboarding-language-grid">
              {supportedLanguages.map((language) => (
                <button type="button" key={language.code} onClick={() => selectOnboardingLanguage(language.code)}>
                  <strong>{language.nativeName}</strong>
                  <span>{language.label}</span>
                </button>
              ))}
            </div>
          </section>
        </main>
      );
    }

    if (onboardingStep === "welcome") {
      return (
        <main className="app-shell access-shell onboarding-shell">
          <section className="access-card onboarding-card" aria-labelledby="welcome-title">
            <div className="section-title">
              <Sprout size={24} aria-hidden="true" />
              <h1 id="welcome-title">Plantie</h1>
            </div>
            <p>{t("onboarding.valueProp")}</p>
            <div className="onboarding-actions">
              {auth.isAuthenticated ? (
                <button className="primary-action" type="button" onClick={continueToHouseholdSetup}>
                  {t("onboarding.continueHousehold")}
                </button>
              ) : (
                <AuthPanel compact language={selectedLanguage} onSuccess={continueToHouseholdSetup} />
              )}
            </div>
            <button className="text-button" type="button" onClick={() => setOnboardingStep("language")}>
              {t("onboarding.changeLanguage")}{selectedLanguage ? ` (${selectedLanguage})` : ""}
            </button>
            {onboardingStatus ? <p className="access-status">{onboardingStatus}</p> : null}
          </section>
        </main>
      );
    }

    return (
      <main className="app-shell access-shell onboarding-shell">
        <section className="access-card onboarding-card" aria-labelledby="household-title">
          <div className="section-title">
            <Home size={22} aria-hidden="true" />
            <h1 id="household-title">{t("household.createOrJoin")}</h1>
          </div>
          <p>{t("household.privateBody")}</p>
          {!auth.isAuthenticated ? (
            <AuthPanel compact language={selectedLanguage} onSuccess={continueToHouseholdSetup} />
          ) : (
            <form className="access-form" onSubmit={handleCreateOnboardingHousehold}>
              <label className="field">
                <span>{t("household.name")}</span>
                <input
                  type="text"
                  value={householdNameDraft}
                  maxLength={80}
                  onChange={(event) => setHouseholdNameDraft(event.target.value)}
                />
              </label>
              <button type="submit" disabled={isCreatingHousehold}>
                <Plus size={18} aria-hidden="true" />
                {isCreatingHousehold ? t("household.creatingShort") : t("household.create")}
              </button>
            </form>
          )}
          {accessStatus || onboardingStatus ? <p className="access-status">{accessStatus || onboardingStatus}</p> : null}
        </section>
      </main>
    );
  }

  if ((isSupabaseHouseholdPending || (!shouldUseSupabaseAccountData && isAccessChecking)) && !isRouteAllowedWithoutHousehold) {
    return (
      <main className="app-shell access-shell">
        <section className="access-card" aria-live="polite">
          <div className="section-title">
            <Home size={20} aria-hidden="true" />
            <h1>{t("household.loading")}</h1>
          </div>
          <p>{t("household.loadingBody")}</p>
        </section>
      </main>
    );
  }

  if (!activeHousehold && !supabaseReadState && !isRouteAllowedWithoutHousehold) {
    return (
      <main className="app-shell access-shell">
        <section className="access-card household-setup-card" aria-labelledby="access-title">
          <div className="household-setup-header">
            <span className="household-setup-icon" aria-hidden="true">
              <Home size={22} />
            </span>
            <div>
              <p className="eyebrow">{t("account.household")}</p>
              <h1 id="access-title">{t("household.setupTitle")}</h1>
              <p>{t("household.setupBody")}</p>
            </div>
          </div>
          {auth.isAuthenticated ? (
            <div className="household-setup-grid">
              <form className="household-setup-option" onSubmit={handleCreateHousehold}>
                <div>
                  <h2>{t("household.setupCreateTitle")}</h2>
                  <p>{t("household.setupCreateBody")}</p>
                </div>
                <label className="field">
                  <span>{t("household.name")}</span>
                  <input
                    type="text"
                    value={householdNameDraft}
                    maxLength={80}
                    placeholder={t("household.defaultName")}
                    onChange={(event) => setHouseholdNameDraft(event.target.value)}
                  />
                </label>
                <button className="primary-action" type="submit" disabled={isCreatingHousehold}>
                  <Plus size={18} aria-hidden="true" />
                  {isCreatingHousehold ? t("household.creatingShort") : t("household.create")}
                </button>
              </form>
              <div className="household-setup-option">
                <div>
                  <h2>{t("household.setupJoinTitle")}</h2>
                  <p>{t("household.setupJoinBody")}</p>
                </div>
                <label className="field">
                  <span>{t("household.inviteToken")}</span>
                  <input
                    value={joinInviteInput}
                    onChange={(event) => setJoinInviteInput(event.target.value)}
                    placeholder="#/join?invite=..."
                  />
                </label>
                <button className="ghost-action" type="button" onClick={() => void handleJoinInvite()}>
                  {t("household.continueWithInvite")}
                </button>
              </div>
            </div>
          ) : (
            <AuthPanel compact language={selectedLanguage} onSuccess={continueToHouseholdSetup} />
          )}
          {auth.isAuthenticated && previousHousehold ? (
            <button className="neutral-action access-return-action" type="button" onClick={restorePreviousHousehold}>
              <ArrowLeft size={17} aria-hidden="true" />
              {t("household.returnTo", { household: previousHousehold.name })}
            </button>
          ) : null}
          {accessStatus ? <p className="access-status">{accessStatus}</p> : null}
        </section>
      </main>
    );
  }

  if (route.page === "detail") {
    const flower = flowerById.get(route.flowerId);
    if (!flower) {
      return (
        <main className="app-shell compact">
          <a className="nav-link" href="#/" onClick={navigateBack("#/")}>
            <ArrowLeft size={18} aria-hidden="true" />
            {t("nav.plants")}
          </a>
          <section className="empty-state">
            <Leaf size={34} aria-hidden="true" />
            <h1>{t("detail.missing")}</h1>
            <p>{t("detail.missingQrBody")}</p>
          </section>
        </main>
      );
    }

    const record = records[flower.id] ?? { lastFertilized: "", note: "", lastWatered: "", lastTransplanted: "" };
    const elapsedDays = daysSince(record.lastWatered);
    const detailUrl = publicFlowerUrl(baseUrl, flower.id);
    const intervalDays = flower.wateringIntervalDays ?? wateringIntervalsDays[flower.id] ?? 7;
    const wateringProgress = getWateringProgress(record.lastWatered, intervalDays);
    const quickActionLabel = route.scan ? t("detail.scanned") : t("detail.quickAction");
    const activeCarePreview = carePreview?.flowerId === flower.id ? carePreview : null;
    const careDiffRows = activeCarePreview ? getCareDiffRows(flower, activeCarePreview.nextCare, intervalDays, t) : [];
    const isEditingName = editingNameFlowerId === flower.id;
    const flowerDiagnostics = diagnostics
      .filter((diagnosis) => diagnosis.plantId === flower.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return (
      <main className="app-shell detail-shell">
        <header className="detail-header">
          <a className="icon-link" href="#/" onClick={navigateBack("#/")} aria-label={t("nav.back")}>
            <ArrowLeft size={22} aria-hidden="true" />
          </a>
          <div>
            <p className="eyebrow">{t("detail.title")}</p>
            {isEditingName ? (
              <div className="plant-name-editor">
                <input
                  type="text"
                  value={draftFlowerName}
                  maxLength={70}
                  aria-label={t("detail.nameInput")}
                  onChange={(event) => setDraftFlowerName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      confirmNameEdit(flower);
                    }
                    if (event.key === "Escape") {
                      cancelNameEdit();
                    }
                  }}
                />
                <button
                  className="name-edit-action name-edit-save"
                  type="button"
                  onClick={() => confirmNameEdit(flower)}
                  disabled={!draftFlowerName.trim()}
                  aria-label={t("detail.saveName")}
                >
                  <Check size={18} aria-hidden="true" />
                </button>
                <button className="name-edit-action" type="button" onClick={cancelNameEdit} aria-label={t("detail.cancelNameEdit")}>
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <div className="plant-title-row">
                <h1>{flower.displayName}</h1>
                <button className="name-edit-button" type="button" onClick={() => startNameEdit(flower)} aria-label={t("detail.nameInput")}>
                  <Pencil size={18} aria-hidden="true" />
                </button>
              </div>
            )}
            <p className="plant-latin-name">{flower.likelyName}</p>
          </div>
        </header>

        <AppTabNav currentPage="plants" onAddPlant={openAddPlantFromMobileNav} t={t} />

        <img className="detail-photo" src={flower.image} alt={flower.displayName} />

        <section className="scan-action-panel" aria-labelledby="quick-action-title">
          <div>
            <span>{quickActionLabel}</span>
            <h2 id="quick-action-title">{t("detail.quickAction")}</h2>
            <p>{t("detail.quickActionBody")}</p>
          </div>
          <div className="scan-action-buttons">
              <button
                className={`primary-action ${quickRecordStatus === t("detail.savedWatered") ? "quick-action-saved" : ""}`}
                type="button"
                onClick={() => saveQuickRecord(flower.id, { lastWatered: todayIsoDate() }, t("detail.savedWatered"))}
            >
              <Droplets size={18} aria-hidden="true" />
              {t("detail.todayWatered")}
            </button>
              <button
                className={`ghost-action ${quickRecordStatus === t("detail.savedTransplanted") ? "quick-action-saved" : ""}`}
                type="button"
                onClick={() => saveQuickRecord(flower.id, { lastTransplanted: todayIsoDate() }, t("detail.savedTransplanted"))}
              >
                <Sprout size={18} aria-hidden="true" />
              {t("detail.todayTransplanted")}
            </button>
            <button
              className={`ghost-action ${quickRecordStatus === t("detail.savedFertilized") ? "quick-action-saved" : ""}`}
              type="button"
              onClick={() => saveQuickRecord(flower.id, { lastFertilized: todayIsoDate() }, t("detail.savedFertilized"))}
            >
              <Leaf size={18} aria-hidden="true" />
              {t("detail.todayFertilized")}
            </button>
            <div className={`quick-save-feedback ${quickRecordStatus ? "quick-save-feedback-visible" : ""}`} aria-live="polite">
              <Check size={16} aria-hidden="true" />
              {quickRecordStatus || t("detail.savedGeneric")}
            </div>
          </div>
        </section>

        <section className="diagnosis-panel" aria-labelledby="diagnosis-title">
          <div>
            <div className="section-title">
              <Camera size={18} aria-hidden="true" />
              <h2 id="diagnosis-title">{t("detail.diagnosisTitle")}</h2>
            </div>
            <p>{t("detail.diagnosisBody")}</p>
          </div>
          <button type="button" onClick={openDiagnosisModal}>
            <Camera size={18} aria-hidden="true" />
            {t("detail.diagnosisAction")}
          </button>
        </section>

        {flower.identification === "confident" ? null : (
          <section className={`identity-note identity-note-${flower.identification}`}>
            <BadgeCheck size={18} aria-hidden="true" />
            <div>
              <strong>{t(`plants.identification.${flower.identification}`)}</strong>
              <span>{flower.identificationNote}</span>
            </div>
          </section>
        )}

        <section className="status-band">
          <div>
            <Droplets size={16} aria-hidden="true" />
            <span>{t("detail.lastWatered")}</span>
            <strong>{formatAppDate(record.lastWatered)}</strong>
          </div>
          <div>
            <Droplets size={16} aria-hidden="true" />
            <span>{t("detail.sinceWatering")}</span>
            <strong>{formatAppElapsedDays(elapsedDays)}</strong>
          </div>
          <div>
            <Sprout size={16} aria-hidden="true" />
            <span>{t("detail.transplanted")}</span>
            <strong>{formatAppDate(record.lastTransplanted)}</strong>
          </div>
          <div>
            <Leaf size={16} aria-hidden="true" />
            <span>{t("detail.fertilized")}</span>
            <strong>{formatAppDate(record.lastFertilized)}</strong>
          </div>
        </section>

        <section className={`watering-panel watering-panel-${wateringProgress.state}`}>
          <div className="watering-panel-header">
            <div>
              <span>{t("detail.wateringStatus")}</span>
              <strong>{Math.round(wateringProgress.percent)} %</strong>
            </div>
            <div>
              <span>{t("detail.nextWatering")}</span>
              <strong>{formatAppDate(wateringProgress.nextWatering)}</strong>
            </div>
          </div>
          <div className="watering-progress-track" aria-label={t("detail.wateringProgressLabel", { percent: Math.round(wateringProgress.percent) })}>
            <div
              className="watering-progress-fill"
              style={{ width: `${wateringProgress.percent}%` }}
            />
          </div>
          <div className="watering-panel-footer">
            <span>{t("detail.intervalDays", { count: intervalDays })}</span>
            <strong>{formatAppWateringStatus(wateringProgress)}</strong>
          </div>
        </section>

        <section className="care-panel" aria-labelledby="care-title">
          <div className="section-title">
            <Leaf size={18} aria-hidden="true" />
            <h2 id="care-title">{t("detail.basicCare")}</h2>
            <button
              className="ai-care-button"
              type="button"
              disabled={isGeneratingCarePreview}
              onClick={() => handleGenerateCarePreview(flower)}
            >
              <Sparkles size={16} aria-hidden="true" />
              {isGeneratingCarePreview ? t("detail.generating") : t("detail.generateAi")}
            </button>
          </div>
          {carePreviewStatus ? <p className="care-preview-status">{carePreviewStatus}</p> : null}
          <p className="care-summary">{flower.shortCare}</p>
          <div className="care-pill-grid" aria-label={t("detail.careProfile")}>
            {flower.carePills.map((pill) => (
              <div className={`care-pill care-pill-${pill.tone}`} key={`${pill.label}-${pill.value}`}>
                {getCarePillVisual(pill.label, pill.value, intervalDays)}
                <div>
                  <span>{pill.label}</span>
                  <strong>{pill.value}</strong>
                </div>
              </div>
            ))}
          </div>
          <dl className="care-list">
            <div>
              <dt>
                {getCarePillVisual("Svetlo", flower.light, intervalDays)}
                <span>{t("detail.light")}</span>
              </dt>
              <dd>{flower.light}</dd>
            </div>
            <div>
              <dt>
                {getCarePillVisual(t("plants.watering"), flower.watering, intervalDays)}
                <span>{t("plants.watering")}</span>
              </dt>
              <dd>{flower.watering}</dd>
            </div>
            <div>
              <dt>
                {getCarePillVisual(t("detail.substrate"), flower.soil, intervalDays)}
                <span>{t("detail.substrate")}</span>
              </dt>
              <dd>{flower.soil}</dd>
            </div>
          </dl>
          <ul className="tip-list">
            {flower.careTips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </section>

        <section className="editor-panel" aria-labelledby="care-log-title">
          <div className="section-title">
            <Pencil size={18} aria-hidden="true" />
            <h2 id="care-log-title">{t("detail.careLog")}</h2>
          </div>
          <label className="toggle-field">
            <span>
              <Bell size={18} aria-hidden="true" />
              {t("detail.notifications")}
            </span>
            <input
              type="checkbox"
              checked={flower.notificationsEnabled !== false}
              onChange={(event) => void saveFlower({ ...flower, notificationsEnabled: event.target.checked, source: "custom" })}
            />
          </label>
          <label className="field">
            <span>{t("detail.lastWateredDate")}</span>
            <div className="date-row">
              <input
                type="date"
                value={record.lastWatered}
                max="9999-12-31"
                onChange={(event) => void updateCareRecord(flower.id, { lastWatered: event.target.value })}
              />
              <button type="button" onClick={() => void updateCareRecord(flower.id, { lastWatered: todayIsoDate() })}>
                {t("date.today")}
              </button>
            </div>
          </label>
          <label className="field">
            <span>{t("detail.transplantedDate")}</span>
            <div className="date-row">
              <input
                type="date"
                value={record.lastTransplanted}
                max="9999-12-31"
                onChange={(event) => void updateCareRecord(flower.id, { lastTransplanted: event.target.value })}
              />
              <button type="button" onClick={() => void updateCareRecord(flower.id, { lastTransplanted: todayIsoDate() })}>
                {t("date.today")}
              </button>
            </div>
          </label>
          <label className="field">
            <span>{t("detail.fertilizedDate")}</span>
            <div className="date-row">
              <input
                type="date"
                value={record.lastFertilized}
                max="9999-12-31"
                onChange={(event) => void updateCareRecord(flower.id, { lastFertilized: event.target.value })}
              />
              <button type="button" onClick={() => void updateCareRecord(flower.id, { lastFertilized: todayIsoDate() })}>
                {t("date.today")}
              </button>
            </div>
          </label>
          <label className="field">
            <span>{t("detail.note")}</span>
            <textarea
              rows={5}
              placeholder={t("detail.notePlaceholder")}
              value={record.note}
              onChange={(event) => void updateCareRecord(flower.id, { note: event.target.value })}
            />
          </label>
        </section>

        <section className="diagnostic-history-panel" aria-labelledby="diagnostic-history-title">
          <div className="section-title">
            <Camera size={18} aria-hidden="true" />
            <h2 id="diagnostic-history-title">{t("diagnosis.history")}</h2>
          </div>
          {flowerDiagnostics.length === 0 ? (
            <p>{t("diagnosis.historyEmpty")}</p>
          ) : (
            <div className="diagnostic-history-list">
              {flowerDiagnostics.map((diagnosis) => {
                const isOpen = openDiagnosticId === diagnosis.id;
                return (
                  <article className={`diagnostic-history-card diagnostic-risk-${diagnosis.riskLevel}`} key={diagnosis.id}>
                    {diagnosis.imageDataUrl ? (
                      <img src={diagnosis.imageDataUrl} alt={t("diagnosis.historyImageAlt", { diagnosis: diagnosis.diagnosisTitle })} />
                    ) : (
                      <div className="diagnostic-image-placeholder">Supabase</div>
                    )}
                    <div>
                      <span>{formatDate(diagnosis.createdAt.slice(0, 10))}</span>
                      <h3>{diagnosis.diagnosisTitle}</h3>
                      <div className="diagnostic-card-meta" aria-label={t("diagnosis.summary")}>
                        <span>{t("diagnosis.confidenceShort", { percent: diagnosis.confidence })}</span>
                        <span>{diagnosis.confidenceLabel}</span>
                        <span>{riskLevelLabel(diagnosis.riskLevel, t)}</span>
                        <span>{diagnosis.userConfirmation === "confirmed" ? t("diagnosis.confirmed") : t("diagnosis.rejected")}</span>
                      </div>
                      <button className="text-action" type="button" onClick={() => setOpenDiagnosticId(isOpen ? "" : diagnosis.id)}>
                        {isOpen ? t("diagnosis.hideDetail") : t("diagnosis.openDetail")}
                      </button>
                      {isOpen ? (
                        <div className="diagnostic-detail">
                          <section>
                            <h4>{t("diagnosis.observed")}</h4>
                            <ul>
                              {diagnosis.observedSymptoms.map((symptom) => (
                                <li key={symptom}>{symptom}</li>
                              ))}
                            </ul>
                          </section>
                          <section>
                            <h4>{t("diagnosis.recommended")}</h4>
                            <ol>
                              {diagnosis.recommendedSteps.map((step) => (
                                <li key={step}>{step}</li>
                              ))}
                            </ol>
                          </section>
                          <section>
                            <h4>{t("diagnosis.reasoning")}</h4>
                            <p>{diagnosis.reasoningSummary}</p>
                          </section>
                          <small>{diagnosis.disclaimer}</small>
                          <label className="field">
                            <span>{t("diagnosis.noteBeforeSave")}</span>
                            <textarea
                              rows={3}
                              value={diagnosis.userNote}
                              onChange={(event) => void updateDiagnosticHistoryEntry(diagnosis.id, { userNote: event.target.value })}
                            />
                          </label>
                          <div className="modal-actions">
                            <button
                              className="primary-action"
                              type="button"
                              onClick={() => void updateDiagnosticHistoryEntry(diagnosis.id, { userConfirmation: "confirmed" })}
                            >
                              {t("diagnosis.confirm")}
                            </button>
                            <button
                              className="neutral-action"
                              type="button"
                              onClick={() => void updateDiagnosticHistoryEntry(diagnosis.id, { userConfirmation: "rejected" })}
                            >
                              {t("diagnosis.reject")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <ol>
                          {diagnosis.recommendedSteps.slice(0, 3).map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                      )}
                      {diagnosis.userNote && !isOpen ? <small>{t("diagnosis.noteInline", { note: diagnosis.userNote })}</small> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="qr-panel" aria-labelledby="single-qr-title">
          <div>
            <div className="section-title">
              <QrCodeIcon size={18} aria-hidden="true" />
              <h2 id="single-qr-title">{t("detail.plantQr")}</h2>
            </div>
            <p>{t("detail.plantQrBody")}</p>
          </div>
          <QrCode value={detailUrl} label={flower.displayName} language={selectedLanguage} />
        </section>

        <section className="danger-panel" aria-labelledby="delete-plant-title">
          <div>
            <div className="section-title danger-title">
              <Trash2 size={18} aria-hidden="true" />
              <h2 id="delete-plant-title">{t("detail.deletePlant")}</h2>
            </div>
            <p>{t("detail.deletePlantBody")}</p>
          </div>
          <button type="button" onClick={() => setDeleteFlowerId(flower.id)}>
            <Trash2 size={18} aria-hidden="true" />
            {t("detail.deletePlant")}
          </button>
        </section>

        {activeCarePreview ? (
          <div className="modal-backdrop" role="presentation">
            <section className="care-preview-modal" role="dialog" aria-modal="true" aria-labelledby="care-preview-title">
              <button className="modal-close" type="button" onClick={() => setCarePreview(null)} aria-label={t("action.close")}>
                <X size={20} aria-hidden="true" />
              </button>
              <div className="section-title">
                <Sparkles size={20} aria-hidden="true" />
                <h2 id="care-preview-title">{t("detail.aiCarePreview")}</h2>
              </div>
              <p>{t("detail.aiCarePreviewBody", { plant: flower.displayName })}</p>

              {careDiffRows.length > 0 ? (
                <div className="care-diff-list" aria-label={t("detail.careChanges")}>
                  {careDiffRows.map((row) => (
                    <article className="care-diff-row" key={row.label}>
                      <h3>{row.label}</h3>
                      <div>
                        <span>{t("detail.currently")}</span>
                        <p>{row.currentValue}</p>
                      </div>
                      <div>
                        <span>{t("detail.replaceWith")}</span>
                        <p>{row.nextValue}</p>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="care-diff-empty">
                  <BadgeCheck size={18} aria-hidden="true" />
                  {t("detail.noCareChanges")}
                </div>
              )}

              <div className="care-update-question">
                <strong>{t("detail.applyCareQuestion")}</strong>
              </div>
              <div className="modal-actions">
                <button className="primary-action" type="button" onClick={confirmCareUpdate} disabled={careDiffRows.length === 0}>
                  {t("detail.applyCare")}
                </button>
                <button className="neutral-action" type="button" onClick={() => setCarePreview(null)}>
                  {t("action.no")}
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {isDiagnosisModalOpen ? (
          <div className="modal-backdrop" role="presentation">
            <section className="diagnosis-modal" role="dialog" aria-modal="true" aria-labelledby="diagnosis-modal-title">
              <button className="modal-close" type="button" onClick={closeDiagnosisModal} aria-label={t("action.close")}>
                <X size={20} aria-hidden="true" />
              </button>
              <div className="section-title">
                <Camera size={20} aria-hidden="true" />
                <h2 id="diagnosis-modal-title">{t("detail.diagnosisAction")}</h2>
              </div>
              <p>{t("diagnosis.modalBody")}</p>

              <label className="field">
                <span>{t("diagnosis.symptoms")}</span>
                <textarea
                  rows={3}
                  value={diagnosisSymptomNotes}
                  maxLength={600}
                  placeholder={t("diagnosis.symptomsPlaceholder")}
                  onChange={(event) => setDiagnosisSymptomNotes(event.target.value)}
                />
              </label>

              <label className="diagnosis-upload">
                <span className="image-upload-icon">
                  <ImagePlus size={19} aria-hidden="true" />
                </span>
                <span className="image-upload-copy">
                  <strong>{t("diagnosis.photoPrompt")}</strong>
                  <small>{t("diagnosis.photoHelp")}</small>
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={(event) => {
                    void handleDiagnosisImageChange("gallery", event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>

              {isNativeImageRuntime ? (
                <div className="image-capture-actions">
                  <button className="ghost-action" type="button" onClick={() => void handleDiagnosisImageChange("camera")}>
                    <Camera size={17} aria-hidden="true" />
                    {t("action.camera")}
                  </button>
                  <button className="ghost-action" type="button" onClick={() => void handleDiagnosisImageChange("gallery")}>
                    <ImagePlus size={17} aria-hidden="true" />
                    {t("action.gallery")}
                  </button>
                </div>
              ) : null}

              {diagnosisImageDataUrl ? <img className="diagnosis-preview" src={diagnosisImagePreviewUrl || diagnosisImageDataUrl} alt={t("diagnosis.previewAlt")} /> : null}
              {diagnosisStatus ? <p className="care-preview-status">{diagnosisStatus}</p> : null}

              <button
                className="primary-action diagnosis-run-button"
                type="button"
                disabled={!diagnosisImageDataUrl || isDiagnosing}
                onClick={() => runPlantDiagnosis(flower)}
              >
                {isDiagnosing ? t("diagnosis.analyzing") : t("diagnosis.run")}
              </button>

              {diagnosisDraft ? (
                <div className={`diagnosis-result diagnosis-risk-${diagnosisDraft.riskLevel}`}>
                  <div className="diagnosis-result-head">
                    <div>
                      <span>{t("diagnosis.result")}</span>
                      <h3>{diagnosisDraft.diagnosisTitle}</h3>
                      <small>{riskLevelLabel(diagnosisDraft.riskLevel, t)}</small>
                    </div>
                    <strong>
                      {t("diagnosis.confidence", { percent: diagnosisDraft.confidence, label: diagnosisDraft.confidenceLabel })}
                    </strong>
                  </div>
                  <div className="diagnosis-result-grid">
                    <section>
                      <h4>{t("diagnosis.observed")}</h4>
                      <ul>
                        {diagnosisDraft.observedSymptoms.map((symptom) => (
                          <li key={symptom}>{symptom}</li>
                        ))}
                      </ul>
                    </section>
                    <section>
                      <h4>{t("diagnosis.recommended")}</h4>
                      <ol>
                        {diagnosisDraft.recommendedSteps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    </section>
                  </div>
                  <section>
                    <h4>{t("diagnosis.reasoning")}</h4>
                    <p>{diagnosisDraft.reasoningSummary}</p>
                  </section>
                  <small>{diagnosisDraft.disclaimer}</small>
                  <label className="field">
                    <span>{t("diagnosis.noteBeforeSave")}</span>
                    <textarea
                      rows={3}
                      value={diagnosisUserNote}
                      placeholder={t("diagnosis.notePlaceholder")}
                      onChange={(event) => setDiagnosisUserNote(event.target.value)}
                    />
                  </label>
                  <div className="modal-actions">
                    <button className="primary-action" type="button" onClick={() => savePlantDiagnosis(flower, "confirmed")}>
                      {t("diagnosis.save")}
                    </button>
                    <button className="neutral-action" type="button" onClick={() => savePlantDiagnosis(flower, "rejected")}>
                      {t("diagnosis.reject")}
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        ) : null}

        {diagnosisUpgradeReason ? (
          <UpgradeModal limitReason={diagnosisUpgradeReason} onClose={() => setDiagnosisUpgradeReason("")} />
        ) : null}

        {deleteFlowerId === flower.id ? (
          <div className="modal-backdrop" role="presentation">
            <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title">
              <div className="section-title danger-title">
                <Trash2 size={20} aria-hidden="true" />
                <h2 id="delete-confirm-title">{t("detail.deleteConfirmTitle")}</h2>
              </div>
              <p>{t("detail.deleteConfirmBody", { plant: flower.displayName })}</p>
              <div className="modal-actions">
                <button className="danger-action" type="button" onClick={confirmRemoveCustomFlower}>
                  {t("detail.deleteConfirmAction")}
                </button>
                <button className="neutral-action" type="button" onClick={() => setDeleteFlowerId("")}>
                  {t("action.no")}
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </main>
    );
  }

  if (route.page === "menu") {
    const openMenuSection = route.section === "household" ? "household" : "account";

    if (!auth.isAuthenticated) {
      return (
        <main className="app-shell compact">
          <header className="topbar">
            <div>
              <p className="eyebrow">Plantie</p>
              <h1>{t("menu.heading")}</h1>
              <p className="topbar-copy">{t("menu.signedOutBody")}</p>
            </div>
          </header>
          <section className="menu-stack" aria-label={t("menu.heading")}>
            <details className="menu-section" open>
              <summary>
                <span>{t("menu.account")}</span>
              </summary>
              <div className="menu-section-body">
                <p>{t("account.loginRequiredBody")}</p>
                <AuthPanel
                  compact
                  language={selectedLanguage}
                  onSuccess={() => {
                    if (normalizeInviteTokenInput(joinInviteInput)) {
                      void handleJoinInvite(joinInviteInput);
                    }
                  }}
                />
              </div>
            </details>

            <details className="menu-section" open={Boolean(joinInviteInput || inviteStatus)}>
              <summary>
                <span>{t("household.inviteTitle")}</span>
              </summary>
              <div className="menu-section-body">
                <p>{t("household.invitePasteBody")}</p>
                <label className="field">
                  <span>{t("household.inviteToken")}</span>
                  <input
                    value={joinInviteInput}
                    onChange={(event) => setJoinInviteInput(event.target.value)}
                    placeholder="#/join?invite=..."
                  />
                </label>
                <button className="primary-action" type="button" onClick={() => void handleJoinInvite()}>
                  {t("household.continueWithInvite")}
                </button>
                {inviteStatus ? <p className={inviteStatusClass}>{inviteStatus}</p> : null}
              </div>
            </details>

            <details className="menu-section">
              <summary>
                <span>{t("account.language")}</span>
              </summary>
              <div className="menu-section-body">
                <div className="onboarding-language-grid compact-language-grid">
                  {supportedLanguages.map((language) => (
                    <button
                      type="button"
                      key={language.code}
                      className={selectedLanguage === language.code ? "selected-language" : ""}
                      onClick={() => selectOnboardingLanguage(language.code)}
                    >
                      <strong>{language.nativeName}</strong>
                      <span>{language.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </details>
          </section>
        </main>
      );
    }

    return (
      <main className="app-shell compact">
        <header className="topbar topbar-with-actions">
          <a className="icon-link" href="#/" onClick={navigateBack("#/")} aria-label={t("nav.back")}>
            <ArrowLeft size={22} aria-hidden="true" />
          </a>
          <div>
            <p className="eyebrow">Plantie</p>
            <h1>{t("menu.heading")}</h1>
            <p className="topbar-copy">{t("menu.body")}</p>
          </div>
          {renderHeroActions()}
        </header>
        <AppTabNav currentPage="menu" onAddPlant={openAddPlantFromMobileNav} t={t} />
        <section className="menu-stack" aria-label="Plantie menu">
          <details className="menu-section" open={openMenuSection === "account"}>
            <summary>
              <span>{t("menu.account")}</span>
            </summary>
            {auth.isAuthenticated ? (
              <div className="menu-section-body">
                <div className="account-summary-list">
                  <div>
                    <span>{t("account.authProvider")}</span>
                    <strong>{auth.user?.email ?? auth.user?.app_metadata?.provider ?? "Email"}</strong>
                  </div>
                  <div>
                    <span>{t("account.subscription")}</span>
                    <strong>{t("account.subscriptionServer")}</strong>
                  </div>
                </div>
                <div className="menu-action-row">
                  <button className="neutral-action" type="button" onClick={() => void handleAccountSignOut()}>
                    {t("account.signOut")}
                  </button>
                  <a className="danger-action" href="#/delete-account">
                    {t("account.delete")}
                  </a>
                </div>
                {accountActionStatus ? <p className="report-status">{accountActionStatus}</p> : null}
              </div>
            ) : (
              <div className="menu-section-body">
                <p>{t("account.loginRequiredBody")}</p>
                <AuthPanel compact language={selectedLanguage} />
              </div>
            )}
          </details>

          <details className="menu-section" open={openMenuSection === "household"}>
            <summary>
              <span>{t("menu.household")}</span>
            </summary>
            <div className="menu-section-body">
              <div className="account-summary-list">
                <div>
                  <span>{t("account.household")}</span>
                  <strong>{activeHousehold || supabaseReadState ? householdDisplayName : t("account.householdRequired")}</strong>
                </div>
                <div>
                  <span>{t("household.members")}</span>
                  <strong>
                    {householdMembers.length > 0
                      ? t("household.memberCount", { count: householdMembers.length })
                      : auth.user?.email ?? t("household.signedInUser")}
                  </strong>
                </div>
              </div>
              {householdMembers.length > 0 ? (
                <div className="household-member-list" aria-label={t("household.members")}>
                  {householdMembers.map((member) => (
                    <div key={member.userId}>
                      <strong>{member.email}</strong>
                      <span>{member.role}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {activeSupabaseHouseholdId && auth.isAuthenticated ? (
                <>
                  <div className="menu-form-grid">
                    <label className="field">
                      <span>{t("household.inviteEmail")}</span>
                      <input
                        type="email"
                        value={inviteEmail}
                        placeholder="rodina@example.com"
                        onChange={(event) => setInviteEmail(event.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>{t("household.role")}</span>
                      <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as HouseholdRole)}>
                        <option value="editor">{t("household.roleEditor")}</option>
                        <option value="viewer">{t("household.roleViewer")}</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>{t("household.inviteExpiresAt")}</span>
                      <input type="datetime-local" value={inviteExpiresAt} onChange={(event) => setInviteExpiresAt(event.target.value)} />
                    </label>
                    <button className="primary-action" type="button" onClick={() => void handleCreateInvite()}>
                      {t("household.createEmailInvite")}
                    </button>
                  </div>
                  {createdInviteLink ? (
                    <div className="report-status">
                      <span>{createdInviteLink}</span>
                      <button type="button" onClick={() => void handleCopyInviteLink()}>
                        {t("household.copyInvite")}
                      </button>
                    </div>
                  ) : null}
                  <div className="menu-invite-list" aria-label="Pending email invites">
                    {householdInvites.length > 0 ? (
                      householdInvites.map((invite) => (
                        <div key={invite.id}>
                          <strong>{invite.inviteeEmail}</strong>
                          <span>
                            {invite.revokedAt
                              ? t("household.inviteStatusRevoked")
                              : invite.usedAt
                                ? t("household.inviteStatusAccepted")
                                : invite.expiresAt
                                  ? t("household.inviteStatusExpires", { date: formatDate(invite.expiresAt.slice(0, 10)) })
                                  : t("household.inviteStatusPending")}
                            {" - "}
                            {invite.role === "editor" ? t("household.roleEditor") : invite.role === "viewer" ? t("household.roleViewer") : t("household.roleOwner")}
                          </span>
                          {!invite.revokedAt && !invite.usedAt ? (
                            <button type="button" onClick={() => void handleRevokeInvite(invite.id)}>
                              {t("household.revokeInvite")}
                            </button>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <span>{t("household.noPendingInvites")}</span>
                    )}
                  </div>
                </>
              ) : auth.isAuthenticated && isSupabaseBackend ? (
                <div className="menu-form-grid">
                  <p>{t("household.createFirstBody")}</p>
                  <form className="menu-form-grid" onSubmit={handleCreateHousehold}>
                    <label className="field">
                      <span>{t("household.name")}</span>
                      <input
                        type="text"
                        value={householdNameDraft}
                        onChange={(event) => setHouseholdNameDraft(event.target.value)}
                        placeholder="Petzvalova"
                      />
                    </label>
                    <button className="primary-action" type="submit" disabled={isCreatingHousehold}>
                      {isCreatingHousehold ? t("household.creatingShort") : t("household.create")}
                    </button>
                  </form>
                  <label className="field">
                    <span>{t("household.inviteToken")}</span>
                    <input
                      value={joinInviteInput}
                      onChange={(event) => setJoinInviteInput(event.target.value)}
                      placeholder="#/join?invite=..."
                    />
                  </label>
                  <button className="neutral-action" type="button" onClick={() => void handleJoinInvite()}>
                    {t("household.join")}
                  </button>
                </div>
              ) : (
                <p>{t("household.inviteRequiresSupabase")}</p>
              )}
              {inviteStatus ? <p className={inviteStatusClass}>{inviteStatus}</p> : null}
            </div>
          </details>
          <details className="menu-section">
            <summary>
              <span>{t("menu.subscription")}</span>
            </summary>
            <div className="menu-section-body">
              <PricingPage language={selectedLanguage} />
            </div>
          </details>

          <details className="menu-section">
            <summary>
              <span>{t("account.language")}</span>
            </summary>
            <div className="menu-section-body">
              <div className="onboarding-language-grid compact-language-grid">
                {supportedLanguages.map((language) => (
                  <button
                    type="button"
                    key={language.code}
                    className={selectedLanguage === language.code ? "selected-language" : ""}
                    onClick={() => selectOnboardingLanguage(language.code)}
                  >
                    <strong>{language.nativeName}</strong>
                    <span>{language.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </details>

          <details className="menu-section">
            <summary>
              <span>{t("menu.supportLegal")}</span>
            </summary>
            <div className="menu-section-body">
              <div className="menu-link-grid">
                <a href="#/privacy">{t("account.privacy")}</a>
                <a href="#/terms">{t("account.terms")}</a>
                <a href="#/support">{t("account.support")}</a>
                <a href="#/subscription-terms">Subscription Terms</a>
                <a href="#/health">Release Health</a>
              </div>
            </div>
          </details>
        </section>
        {renderHouseholdSheet()}
        <MobileBottomNav currentPage="menu" onAddPlant={openAddPlantFromMobileNav} t={t} />
      </main>
    );
  }

  if (route.page === "diagnose") {
    return (
      <main className="app-shell compact">
        <header className="topbar topbar-with-actions">
          <a className="icon-link" href="#/" onClick={navigateBack("#/")} aria-label={t("nav.back")}>
            <ArrowLeft size={22} aria-hidden="true" />
          </a>
          <div>
            <p className="eyebrow">{t("diagnosis.premiumReady")}</p>
            <h1>{t("diagnosis.heading")}</h1>
            <p className="topbar-copy">{t("diagnosis.headingBody")}</p>
          </div>
          {renderHeroActions()}
        </header>
        <AppTabNav currentPage="diagnose" onAddPlant={openAddPlantFromMobileNav} t={t} />
        <section className="toolbar diagnose-toolbar" aria-label={t("dashboard.search")}>
          <label className="search-field">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">{t("dashboard.search")}</span>
            <input
              type="search"
              placeholder={t("dashboard.search")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </section>
        <section className="diagnose-picker" aria-labelledby="diagnose-picker-title">
          <div className="section-title">
            <Camera size={18} aria-hidden="true" />
            <h2 id="diagnose-picker-title">{t("diagnosis.pick")}</h2>
          </div>
          <p>{t("diagnosis.pickBody")}</p>
          {filteredFlowers.length > 0 ? (
            <div className="diagnose-picker-list">
              {visibleFlowers.map((flower) => (
                <a className="diagnose-picker-card" href={flowerPath(flower.id, true)} key={flower.id}>
                  <img src={flower.image} alt={flower.displayName} loading="lazy" />
                  <div>
                    <strong>{flower.displayName}</strong>
                    <span>{t("diagnosis.savedCount", { count: flowerDiagnosticsCount(flower.id, diagnostics) })}</span>
                  </div>
                  <ChevronRight className="diagnose-picker-open-icon" size={18} aria-hidden="true" />
                </a>
              ))}
            </div>
          ) : (
            <div className="empty-state empty-state-card">
              <Sprout size={34} aria-hidden="true" />
              <h2>{allFlowers.length > 0 ? t("dashboard.emptySearch") : t("diagnosis.empty")}</h2>
              <p>{allFlowers.length > 0 ? t("dashboard.emptySearchBody") : t("diagnosis.emptyBody")}</p>
              {allFlowers.length > 0 ? null : <a className="primary-action" href="#/">{t("qr.openDashboard")}</a>}
            </div>
          )}
        </section>
        {filteredFlowers.length > plantPageSize ? (
          <nav className="plant-pagination" aria-label="Plant pages">
            <button type="button" disabled={plantPage === 1} onClick={() => setPlantPage(1)} aria-label="First page">
              <ArrowLeft size={16} aria-hidden="true" />
              <ArrowLeft size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={plantPage === 1}
              onClick={() => setPlantPage((currentPage) => Math.max(1, currentPage - 1))}
              aria-label="Previous page"
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
            <span>
              {plantPage} / {plantPageCount}
            </span>
            <button
              type="button"
              disabled={plantPage === plantPageCount}
              onClick={() => setPlantPage((currentPage) => Math.min(plantPageCount, currentPage + 1))}
              aria-label="Next page"
            >
              <ArrowRight size={18} aria-hidden="true" />
            </button>
            <button type="button" disabled={plantPage === plantPageCount} onClick={() => setPlantPage(plantPageCount)} aria-label="Last page">
              <ArrowRight size={16} aria-hidden="true" />
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </nav>
        ) : null}
        {renderHouseholdSheet()}
        <MobileBottomNav currentPage="diagnose" onAddPlant={openAddPlantFromMobileNav} t={t} />
      </main>
    );
  }

  if (route.page === "qr") {
    return (
      <main className="app-shell qr-shell">
        <header className="topbar topbar-with-actions">
          <a className="icon-link" href="#/" onClick={navigateBack("#/")} aria-label={t("nav.back")}>
            <ArrowLeft size={22} aria-hidden="true" />
          </a>
          <div>
            <p className="eyebrow">{t("qr.printable")}</p>
            <h1>{t("qr.heading")}</h1>
            <p className="topbar-copy">Generate and print plant labels that open each plant profile.</p>
          </div>
          <div className="topbar-actions">
            <button className="icon-button" type="button" onClick={handleQrPdfExport} aria-label={t("qr.exportPdf")}>
              <FileDown size={21} aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" onClick={() => window.print()} aria-label={t("qr.printCodes")}>
              <Printer size={21} aria-hidden="true" />
            </button>
            {renderHeroActions()}
          </div>
        </header>
        <AppTabNav currentPage="qr" onAddPlant={openAddPlantFromMobileNav} t={t} />

        <section className="base-url-panel">
          <label className="field">
            <span>{t("qr.publicUrl")}</span>
            <input
              type="url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://tvoja-cloud-aplikacia.example"
            />
          </label>
          <p>{t("qr.publicUrlBody")}</p>
        </section>

        <section className="pdf-export-panel" aria-labelledby="pdf-export-title">
          <div className="section-title">
            <FileDown size={18} aria-hidden="true" />
            <h2 id="pdf-export-title">{t("qr.print")}</h2>
          </div>
          {allFlowers.length > 0 ? (
            <>
              <p>
                {t("qr.pdfBody", {
                  labelSize: qrLabelSpec.labelSizeMm,
                  qrSize: qrLabelSpec.qrSizeMm,
                  quietZone: qrLabelSpec.quietZoneMm,
                })}
              </p>
              <p className="print-note">{t("qr.printNote")}</p>
              <div className="pdf-export-actions">
                <button type="button" onClick={handleQrPdfExport}>
                  <FileDown size={18} aria-hidden="true" />
                  {t("qr.exportPdf")}
                </button>
                <span>{qrLabelValidation.message}</span>
              </div>
              {qrExportStatus ? <div className="report-status">{qrExportStatus}</div> : null}
            </>
          ) : (
            <p>{t("qr.noPlantsExport")}</p>
          )}
        </section>

        {allFlowers.length > 0 ? (
          <section className="qr-grid" aria-label="QR labels for all plants">
            {allFlowers.map((flower) => (
              <article className="qr-label" key={flower.id}>
                <QrCode value={publicFlowerUrl(baseUrl, flower.id)} label={flower.displayName} language={selectedLanguage} size={148} />
                <div>
                  <strong>{flower.displayName}</strong>
                  <span>{flower.id.replace("flower-", "#")}</span>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="empty-state empty-state-card">
            <QrCodeIcon size={34} aria-hidden="true" />
            <h2>{t("qr.empty")}</h2>
            <p>{t("qr.emptyBody")}</p>
            <a className="primary-action" href="#/">{t("qr.openDashboard")}</a>
          </section>
        )}
        {renderHouseholdSheet()}
        <MobileBottomNav currentPage="qr" onAddPlant={openAddPlantFromMobileNav} t={t} />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">{t("dashboard.tracked", { count: allFlowers.length })}</p>
          <h1>{t("dashboard.hero")}</h1>
          <p className="hero-copy">{t("dashboard.heroBody")}</p>
        </div>
        {renderHeroActions()}
      </header>
      <AppTabNav currentPage={isAddPlantModalOpen ? "add" : "plants"} onAddPlant={openAddPlantFromMobileNav} t={t} />
      <section className="toolbar" aria-label={t("dashboard.tools")}>
        <label className="search-field">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">{t("dashboard.search")}</span>
          <input
            type="search"
            placeholder={t("dashboard.search")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </section>

      {renderHouseholdSheet()}

      {isAddPlantModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="plant-modal" role="dialog" aria-modal="true" aria-labelledby="add-plant-title">
            <button className="modal-close" type="button" onClick={() => setIsAddPlantModalOpen(false)} aria-label={t("action.close")}>
              <X size={20} aria-hidden="true" />
            </button>
            <div className="section-title">
              <Plus size={18} aria-hidden="true" />
              <h2 id="add-plant-title">{t("plantForm.title")}</h2>
            </div>
            <p>{t("plantForm.body")}</p>
            <form className="add-plant-form modal-form" onSubmit={handleAddCustomFlower}>
              <label className="field">
                <span>{t("plantForm.name")}</span>
                <input
                  type="text"
                  value={newPlantName}
                  maxLength={80}
                  placeholder={t("plantForm.namePlaceholder")}
                  onChange={(event) => setNewPlantName(event.target.value)}
                />
              </label>
              <label className="field">
                <span>{t("plantForm.image")}</span>
                <label className="image-upload">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      void handleNewPlantImageCapture("gallery", event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                  <span className="image-upload-icon">
                    <ImagePlus size={22} aria-hidden="true" />
                  </span>
                  <span className="image-upload-copy">
                    <strong>{newPlantImage ? newPlantImage.name : t("plantForm.choosePhoto")}</strong>
                    <small>{newPlantImage ? t("plantForm.photoReady") : t("plantForm.photoHelp")}</small>
                  </span>
                </label>
                {isNativeImageRuntime ? (
                  <div className="image-capture-actions">
                    <button className="ghost-action" type="button" onClick={() => void handleNewPlantImageCapture("camera")}>
                      <Camera size={17} aria-hidden="true" />
                      {t("action.camera")}
                    </button>
                    <button className="ghost-action" type="button" onClick={() => void handleNewPlantImageCapture("gallery")}>
                      <ImagePlus size={17} aria-hidden="true" />
                      {t("action.gallery")}
                    </button>
                  </div>
                ) : null}
                {newPlantImage ? <img className="diagnosis-preview" src={newPlantImage.previewUrl} alt={t("plantForm.previewAlt")} /> : null}
              </label>
              <button type="submit" disabled={isAddingPlant}>
                <Plus size={18} aria-hidden="true" />
                {isAddingPlant ? t("plantForm.adding") : t("dashboard.addPlant")}
              </button>
            </form>
            {newPlantStatus ? <div className="report-status">{newPlantStatus}</div> : null}
          </section>
        </div>
      ) : null}

      {isNewOnboardingHousehold && customFlowers.length === 0 ? (
        <section className="empty-state onboarding-empty-dashboard" aria-labelledby="empty-dashboard-title">
          <Sprout size={36} aria-hidden="true" />
          <h2 id="empty-dashboard-title">{t("household.ready")}</h2>
          <p>{t("household.readyBody")}</p>
          <div className="onboarding-empty-actions">
            <button className="primary-action" type="button" onClick={() => setIsAddPlantModalOpen(true)}>
              <Plus size={18} aria-hidden="true" />
              {t("plantForm.addFirst")}
            </button>
            <a className="neutral-action" href="#/qr">
              <QrCodeIcon size={18} aria-hidden="true" />
              {t("qr.scan")}
            </a>
            <a className="neutral-action" href="#/menu">
              <FileDown size={18} aria-hidden="true" />
              {t("menu.open")}
            </a>
          </div>
        </section>
      ) : (
      <section className="flower-grid" aria-label={t("dashboard.hero")}>
        {visibleFlowers.map((flower) => {
          const record = records[flower.id] ?? { lastFertilized: "", note: "", lastWatered: "", lastTransplanted: "" };
          const intervalDays = flower.wateringIntervalDays ?? wateringIntervalsDays[flower.id] ?? 7;
          const wateringProgress = getWateringProgress(record.lastWatered, intervalDays);

          return (
            <article
              className="flower-card"
              key={flower.id}
              role="link"
              tabIndex={0}
              aria-label={t("plants.openPlant", { plant: flower.displayName })}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("button,a")) {
                  return;
                }
                window.location.hash = flowerPath(flower.id).slice(1);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") {
                  return;
                }
                event.preventDefault();
                window.location.hash = flowerPath(flower.id).slice(1);
              }}
            >
              <img src={flower.image} alt={flower.displayName} loading="lazy" />
              <div className="flower-card-body">
                <div className="card-topline">
                  <span className="flower-index">{flower.id.replace("flower-", "#")}</span>
                </div>
                <h2>{flower.displayName}</h2>
                <div className={`image-watering image-watering-${wateringProgress.state}`}>
                  <div className="image-watering-label">
                    <span>{t("plants.watering")}</span>
                    <strong>{Math.round(wateringProgress.percent)} %</strong>
                  </div>
                  <div className="image-progress-track">
                    <div className="image-progress-fill" style={{ width: `${wateringProgress.percent}%` }} />
                  </div>
                  <small>{formatAppWateringStatus(wateringProgress)}</small>
                </div>
                <div className="plant-card-actions">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void updateCareRecord(flower.id, { lastWatered: todayIsoDate() });
                    }}
                  >
                    <Droplets size={16} aria-hidden="true" />
                    {t("plants.water")}
                  </button>
                  <a className="plant-card-open-action" href={flowerPath(flower.id)} onClick={(event) => event.stopPropagation()} aria-label={`Open ${flower.displayName}`}>
                    <ArrowRight size={17} aria-hidden="true" />
                    {t("plants.open")}
                  </a>
                </div>
              </div>
            </article>
          );
        })}
      </section>
      )}

      {!isNewOnboardingHousehold && filteredFlowers.length > plantPageSize ? (
        <nav className="plant-pagination" aria-label="Plant pages">
          <button type="button" disabled={plantPage === 1} onClick={() => setPlantPage(1)} aria-label="First page">
            &lt;&lt;
          </button>
          <button
            type="button"
            disabled={plantPage === 1}
            onClick={() => setPlantPage((currentPage) => Math.max(1, currentPage - 1))}
            aria-label="Previous page"
          >
            &lt;
          </button>
          <span>
            {plantPage} / {plantPageCount}
          </span>
          <button
            type="button"
            disabled={plantPage === plantPageCount}
            onClick={() => setPlantPage((currentPage) => Math.min(plantPageCount, currentPage + 1))}
            aria-label="Next page"
          >
            &gt;
          </button>
          <button type="button" disabled={plantPage === plantPageCount} onClick={() => setPlantPage(plantPageCount)} aria-label="Last page">
            &gt;&gt;
          </button>
        </nav>
      ) : null}

      {!isNewOnboardingHousehold && filteredFlowers.length === 0 ? (
        <section className="empty-state">
          <Home size={34} aria-hidden="true" />
          <h2>{t("dashboard.emptySearch")}</h2>
          <p>{t("dashboard.emptySearchBody")}</p>
        </section>
      ) : null}
      <MobileBottomNav currentPage="plants" onAddPlant={openAddPlantFromMobileNav} t={t} />
    </main>
  );
};
