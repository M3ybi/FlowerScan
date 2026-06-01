import {
  ArrowLeft,
  BadgeCheck,
  Bell,
  BellOff,
  Camera,
  Check,
  Copy,
  Droplets,
  FileDown,
  ImagePlus,
  Home,
  Leaf,
  Mail,
  Pencil,
  Plus,
  Printer,
  QrCodeIcon,
  Search,
  Send,
  Sparkles,
  Sprout,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { AuthButton } from "./components/AuthButton";
import { LegacyMigrationCard } from "./components/LegacyMigrationCard";
import { PricingPage } from "./components/PricingPage";
import { QrCode } from "./components/QrCode";
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
import {
  compareLegacyAndSupabaseHouseholdState,
  detectDataSourceMode,
  loadSupabaseReadThroughState,
} from "./lib/supabaseReadThrough";
import type { LegacySupabaseComparison, SupabaseReadThroughState } from "./lib/supabaseReadThrough";
import {
  createSupabaseDiagnosis,
  detectSupabaseWriteMode,
  runSupabaseWrite,
  setSupabasePlantRemoved,
  updateSupabaseCareRecord,
  updateSupabaseDiagnosis,
  updateSupabaseReportSettings,
  upsertSupabasePlantFromFlower,
} from "./lib/supabaseSourceOfTruth";
import {
  getHouseholdPlantByLegacyId,
  getPlantDiagnostics,
  getUserHouseholds,
} from "./lib/plantieRepository";
import { getReminderArchitectureNote, normalizeReminderSettings } from "./lib/reminderService";
import {
  createCustomFlowerId,
  fetchGeneratedCare,
  imageSourceToDataUrl,
} from "./utils/customFlower";
import type { GeneratedCare } from "./utils/customFlower";
import { daysSince, formatDate, formatElapsedDays } from "./utils/dates";
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
import { createMailtoReportUrl, getWateringReportRows, reportThresholdPercent } from "./utils/report";
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
import type { DiagnosisConfirmation, PlantDiagnosisDraft, PlantDiagnosticEntry } from "./utils/diagnostics";

const todayIsoDate = () => {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${today.getFullYear()}-${month}-${day}`;
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

const identificationLabel = {
  confident: "ID overené z fotky",
  likely: "Pravdepodobné ID",
  "needs-confirmation": "ID treba potvrdiť",
};

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

const formatCareTips = (careTips: string[]) => careTips.map((tip) => `• ${tip}`).join("\n");

const getCareDiffRows = (flower: Flower, nextCare: GeneratedCare, currentIntervalDays: number): CareDiffRow[] => {
  const candidates: CareDiffRow[] = [
    { label: "Názov", currentValue: flower.displayName, nextValue: nextCare.displayName },
    { label: "Botanické ID", currentValue: flower.likelyName, nextValue: nextCare.likelyName },
    { label: "Krátky popis", currentValue: flower.shortCare, nextValue: nextCare.shortCare },
    { label: "Rýchle info pily", currentValue: formatCarePills(flower.carePills), nextValue: formatCarePills(nextCare.carePills) },
    { label: "Svetlo", currentValue: flower.light, nextValue: nextCare.light },
    { label: "Zálievka", currentValue: flower.watering, nextValue: nextCare.watering },
    {
      label: "Interval zálievky",
      currentValue: `${currentIntervalDays} dní`,
      nextValue: `${nextCare.wateringIntervalDays} dní`,
    },
    { label: "Substrát", currentValue: flower.soil, nextValue: nextCare.soil },
    { label: "Tipy", currentValue: formatCareTips(flower.careTips), nextValue: formatCareTips(nextCare.careTips) },
    { label: "Poznámka k identifikácii", currentValue: flower.identificationNote, nextValue: nextCare.identificationNote },
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

const riskLevelLabel = (riskLevel: PlantDiagnosticEntry["riskLevel"]) => {
  if (riskLevel === "high") {
    return "vysoké riziko";
  }

  if (riskLevel === "medium") {
    return "stredné riziko";
  }

  return "nízke riziko";
};

const flowerDiagnosticsCount = (flowerId: string, diagnostics: PlantDiagnosticEntry[]) =>
  diagnostics.filter((diagnostic) => diagnostic.plantId === flowerId).length;

const MobileBottomNav = () => (
  <nav className="mobile-bottom-nav" aria-label="Hlavná mobilná navigácia">
    <a href="#/">
      <Leaf size={18} aria-hidden="true" />
      Rastliny
    </a>
    <a href="#/diagnose">
      <Camera size={18} aria-hidden="true" />
      Diagnóza
    </a>
    <a href="#/qr">
      <QrCodeIcon size={18} aria-hidden="true" />
      QR
    </a>
    <a href="#/account">
      <Home size={18} aria-hidden="true" />
      Účet
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

  if (hash === "#/report") {
    return { page: "report" as const };
  }

  if (hash === "#/account") {
    return { page: "account" as const };
  }

  return { page: "dashboard" as const };
};

const pageTitle = (pageName: string) => `${pageName} | Plantie`;

const isSupabaseReadThroughEnabled = import.meta.env.VITE_ENABLE_SUPABASE_READS === "true";
const isSupabaseWriteThroughEnvEnabled = isSupabaseReadThroughEnabled && import.meta.env.VITE_ENABLE_SUPABASE_WRITES === "true";
const supabaseWritesDisabledStorageKey = "plantie-disable-supabase-writes-v1";

const dataSourceLabel = {
  error: "Fallback",
  fallback: "Fallback",
  legacy: "Legacy",
  "supabase-readwrite": "Supabase source of truth",
  "supabase-readonly": "Supabase preview",
};

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
    () => [
      ...customFlowers,
      ...builtInFlowers.filter((flower) => !customFlowers.some((customFlower) => customFlower.id === flower.id)),
    ].filter((flower) => !removedFlowerIds.includes(flower.id)),
    [customFlowers, removedFlowerIds],
  );
  const legacyAllFlowersIncludingRemoved = useMemo(
    () => [...customFlowers, ...builtInFlowers.filter((flower) => !customFlowers.some((customFlower) => customFlower.id === flower.id))],
    [customFlowers],
  );
  const { records: legacyRecords, replaceRecords, updateRecord } = useFlowerRecords(legacyAllFlowers);
  const [query, setQuery] = useState("");
  const [baseUrl, setBaseUrl] = useState(() => currentBaseUrl());
  const [activeHousehold, setActiveHousehold] = useState<HouseholdSession | null>(() => getStoredHouseholdSession());
  const [accessStatus, setAccessStatus] = useState("");
  const [householdNameDraft, setHouseholdNameDraft] = useState("Moja domácnosť");
  const [householdLinkStatus, setHouseholdLinkStatus] = useState("");
  const [isAccessChecking, setIsAccessChecking] = useState(true);
  const [isCreatingHousehold, setIsCreatingHousehold] = useState(false);
  const [reportRecipient, setReportRecipient] = useState(() => window.localStorage.getItem("flowscan-report-recipient-v1") ?? "");
  const [reportStatus, setReportStatus] = useState("Denný report sa odosiela o 19:00, keď je aplikácia nasadená cez Netlify.");
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(false);
  const [cloudSyncReady, setCloudSyncReady] = useState(false);
  const [qrExportStatus, setQrExportStatus] = useState("");
  const [newPlantName, setNewPlantName] = useState("");
  const [newPlantImage, setNewPlantImage] = useState<NormalizedImage | null>(null);
  const [newPlantStatus, setNewPlantStatus] = useState("");
  const [isAddingPlant, setIsAddingPlant] = useState(false);
  const [isAddPlantModalOpen, setIsAddPlantModalOpen] = useState(false);
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
  const [supabasePlantIdsByLegacyId, setSupabasePlantIdsByLegacyId] = useState<Record<string, string>>({});
  const [quickRecordStatus, setQuickRecordStatus] = useState("");
  const [supabaseReadState, setSupabaseReadState] = useState<SupabaseReadThroughState | null>(null);
  const [supabaseReadError, setSupabaseReadError] = useState(false);
  const [supabaseCompareResult, setSupabaseCompareResult] = useState<LegacySupabaseComparison | null>(null);
  const [supabaseWriteWarning, setSupabaseWriteWarning] = useState("");
  const [isSupabaseWritesLocallyDisabled, setIsSupabaseWritesLocallyDisabled] = useState(
    () => window.localStorage.getItem(supabaseWritesDisabledStorageKey) === "true",
  );
  const isSupabaseWriteThroughEnabled = isSupabaseWriteThroughEnvEnabled && !isSupabaseWritesLocallyDisabled;
  const isNativeImageRuntime = detectImageRuntime() !== "web";
  const dataSourceMode = detectDataSourceMode({
    featureEnabled: isSupabaseReadThroughEnabled,
    hasAuthenticatedUser: auth.isAuthenticated,
    hasMigratedHousehold: Boolean(supabaseReadState),
    readError: supabaseReadError,
    writesEnabled: isSupabaseWriteThroughEnabled,
  });
  const supabaseWriteMode = detectSupabaseWriteMode({
    hasAuthenticatedUser: auth.isAuthenticated,
    hasMigratedHousehold: Boolean(supabaseReadState),
    readsEnabled: isSupabaseReadThroughEnabled,
    writesEnabled: isSupabaseWriteThroughEnabled,
  });
  const isUsingSupabaseReadState =
    (dataSourceMode === "supabase-readonly" || dataSourceMode === "supabase-readwrite") && Boolean(supabaseReadState);
  const allFlowersIncludingRemoved = isUsingSupabaseReadState ? supabaseReadState?.allFlowers ?? [] : legacyAllFlowersIncludingRemoved;
  const allFlowers = isUsingSupabaseReadState
    ? (supabaseReadState?.allFlowers ?? []).filter((flower) => !(supabaseReadState?.removedFlowerIds ?? []).includes(flower.id))
    : legacyAllFlowers;
  const records = isUsingSupabaseReadState ? supabaseReadState?.records ?? {} : legacyRecords;
  const diagnostics = isUsingSupabaseReadState ? supabaseReadState?.diagnostics ?? [] : legacyDiagnostics;
  const effectiveReportRecipient = isUsingSupabaseReadState
    ? supabaseReadState?.reportSettings.recipientEmail ?? reportRecipient
    : reportRecipient;
  const flowerById = useMemo(
    () => new Map(allFlowersIncludingRemoved.map((flower) => [flower.id, flower])),
    [allFlowersIncludingRemoved],
  );
  const legacyHouseholdState = useMemo(
    () => ({
      activeHousehold,
      allFlowers: legacyAllFlowersIncludingRemoved,
      customFlowers,
      diagnostics: legacyDiagnostics,
      records: legacyRecords,
      removedFlowerIds,
      reportSettings: { recipientEmail: reportRecipient },
    }),
    [activeHousehold, customFlowers, legacyAllFlowersIncludingRemoved, legacyDiagnostics, legacyRecords, removedFlowerIds, reportRecipient],
  );

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [route.page, "flowerId" in route ? route.flowerId : ""]);

  useEffect(() => {
    if (route.page === "detail") {
      const flower = flowerById.get(route.flowerId);
      document.title = pageTitle(flower?.displayName ?? "Detail rastliny");
      return;
    }

  if (route.page === "qr") {
      document.title = pageTitle("QR štítky");
      return;
    }

  if (route.page === "diagnose") {
      document.title = pageTitle("AI diagnostika");
      return;
    }

    if (route.page === "report") {
      document.title = pageTitle("Denný report");
      return;
    }

    document.title = pageTitle("Prehľad rastlín");
  }, [flowerById, route.page, "flowerId" in route ? route.flowerId : ""]);

  useEffect(() => {
    window.localStorage.setItem(diagnosticsStorageKey, JSON.stringify(legacyDiagnostics));
  }, [legacyDiagnostics]);

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
      setSupabasePlantIdsByLegacyId(nextState.supabasePlantIdsByLegacyId);
      setSupabaseCompareResult(compareLegacyAndSupabaseHouseholdState(legacyHouseholdState, nextState));
    }

    return nextState;
  };

  const disableSupabaseWritesLocally = () => {
    window.localStorage.setItem(supabaseWritesDisabledStorageKey, "true");
    setIsSupabaseWritesLocallyDisabled(true);
    setSupabaseWriteWarning("Supabase write mode is disabled locally. Legacy writes remain intact for rollback.");
  };

  const writeSupabaseFirst = async <T,>(
    operation: () => Promise<T>,
    mirrorLegacy: () => void,
    fallbackMessage = "Supabase write failed. Saved to legacy storage for rollback.",
  ) => {
    if (supabaseWriteMode !== "supabase-first") {
      mirrorLegacy();
      return false;
    }

    const result = await runSupabaseWrite(operation);
    mirrorLegacy();

    if (result.mode === "fallback") {
      setSupabaseReadError(true);
      setSupabaseWriteWarning(fallbackMessage);
      return false;
    }


    try {
      await refreshSupabaseReadState();
      setSupabaseWriteWarning("");
    } catch {
      setSupabaseReadError(true);
      setSupabaseWriteWarning("Supabase write succeeded, but read-back verification failed. Legacy mirror remains available.");
    }

    return true;
  };

  useEffect(() => {
    if (!isSupabaseReadThroughEnabled || auth.loading || !auth.isAuthenticated) {
      setSupabaseReadState(null);
      setSupabaseReadError(false);
      setSupabaseCompareResult(null);
      return;
    }

    let cancelled = false;

    const loadReadThroughState = async () => {
      try {
        const nextState = await loadSupabaseReadThroughState(activeHousehold);
        if (!cancelled) {
          setSupabaseReadState(nextState);
          setSupabaseReadError(false);
          setSupabaseCompareResult(null);
          if (nextState) {
            setSupabasePlantIdsByLegacyId(nextState.supabasePlantIdsByLegacyId);
          }
        }
      } catch {
        if (!cancelled) {
          setSupabaseReadState(null);
          setSupabaseReadError(true);
          setSupabaseCompareResult(null);
        }
      }
    };

    void loadReadThroughState();

    return () => {
      cancelled = true;
    };
  }, [activeHousehold, auth.isAuthenticated, auth.loading]);

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
          setSupabasePlantIdsByLegacyId(Object.fromEntries(entries.filter((entry): entry is [string, string] => Boolean(entry))));
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
  }, [activeHousehold, allFlowers, auth.isAuthenticated]);

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
  }, [auth.isAuthenticated, supabasePlantIdsByLegacyId]);

  useEffect(() => {
    let cancelled = false;

    const resolveHousehold = async () => {
      const urlToken = getHouseholdTokenFromUrl();
      const storedHousehold = getStoredHouseholdSession();
      const token = urlToken || storedHousehold?.publicToken || "";

      if (!token) {
        setActiveHousehold(null);
        setAccessStatus("");
        setIsAccessChecking(false);
        return;
      }

      try {
        setIsAccessChecking(true);
        const response = await fetch(createHouseholdApiUrl("/.netlify/functions/household-access", token));
        if (!response.ok) {
          throw new Error("Household access failed.");
        }

        const data = (await response.json()) as { household?: HouseholdSession };
        if (!data.household || !isValidHouseholdToken(data.household.publicToken)) {
          throw new Error("Invalid household response.");
        }

        if (cancelled) {
          return;
        }

        storeHouseholdSession(data.household);
        setActiveHousehold(data.household);
        setBaseUrl(currentHouseholdBaseUrl(data.household.publicToken));
        setAccessStatus("");
      } catch {
        if (!cancelled) {
          clearHouseholdSession();
          setActiveHousehold(null);
          setCloudSyncEnabled(false);
          setAccessStatus("Link domácnosti nie je platný alebo už nie je dostupný.");
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
  }, []);

  useEffect(() => {
    if (!activeHousehold) {
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
        setReportStatus("Cloud sync je aktívny. Denný email sa odošle o 19:00.");
      } catch {
        if (!cancelled) {
          setCloudSyncEnabled(false);
          setReportStatus("Na tomto hostingu nie je aktívny backend. Report si vieš pozrieť a otvoriť ako email ručne.");
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
      setPushStatus("Tento prehliadač nepodporuje push notifikácie.");
      return;
    }

    void navigator.serviceWorker
      .getRegistration()
      .then((registration) => registration?.pushManager.getSubscription() ?? null)
      .then((subscription) => {
        setPushEnabled(Boolean(subscription));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!activeHousehold || !cloudSyncReady || !cloudSyncEnabled) {
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
      }).catch(() => {
        setReportStatus("Cloud sync sa nepodaril. Lokálne zmeny sú uložené v tomto zariadení.");
      });
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [activeHousehold, cloudSyncEnabled, cloudSyncReady, customFlowers, legacyDiagnostics, legacyRecords, removedFlowerIds]);

  const reportRows = useMemo(() => getWateringReportRows(records, allFlowers), [allFlowers, records]);
  const qrLabelValidation = useMemo(
    () => validateQrLabelLayout(createQrLabelLayout(allFlowers, baseUrl)),
    [allFlowers, baseUrl],
  );

  const saveReportRecipient = async () => {
    if (!activeHousehold) {
      setReportStatus("Najprv otvor alebo vytvor domácnosť.");
      return;
    }

    const recipient = reportRecipient.trim();
    if (!recipient) {
      setReportStatus("Najprv zadaj email príjemcu reportu.");
      return;
    }
    if (supabaseWriteMode === "supabase-first" && supabaseReadState) {
      const wroteSupabase = await writeSupabaseFirst(
        () => updateSupabaseReportSettings(supabaseReadState.household.id, { recipientEmail: recipient }),
        () => window.localStorage.setItem("flowscan-report-recipient-v1", recipient),
        "Supabase report settings update failed. Recipient is saved locally for rollback.",
      );
      setReportStatus(
        wroteSupabase
          ? "Recipient saved to Supabase. Legacy mirror remains available for rollback."
          : "Recipient saved locally. Supabase write failed and the app fell back to legacy."
      );
      return;
    }


    try {
      const response = await fetch(createHouseholdApiUrl("/.netlify/functions/report-settings", activeHousehold.publicToken), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ householdId: activeHousehold.publicToken, recipient }),
      });

      if (!response.ok) {
        throw new Error("Recipient could not be saved.");
      }

      setCloudSyncEnabled(true);
      setReportStatus("Príjemca je uložený. Denný report sa odošle každý deň o 19:00.");
    } catch {
      window.localStorage.setItem("flowscan-report-recipient-v1", recipient);
      setReportStatus("Príjemca je uložený lokálne. Automatické odosielanie potrebuje Netlify backend.");
    }
  };

  const enablePushNotifications = async () => {
    if (!activeHousehold) {
      setPushStatus("Najprv otvor alebo vytvor domácnosť.");
      return;
    }

    try {
      setPushStatus("Zapínam push notifikácie...");
      await subscribeToPushNotifications(activeHousehold.publicToken);
      setPushEnabled(true);
      setPushStatus("Push notifikácie sú zapnuté pre toto zariadenie.");
    } catch (error) {
      setPushStatus(error instanceof Error ? error.message : "Push notifikácie sa nepodarilo zapnúť.");
    }
  };

  const disablePushNotifications = async () => {
    if (!activeHousehold) {
      setPushStatus("Najprv otvor alebo vytvor domácnosť.");
      return;
    }

    try {
      setPushStatus("Vypínam push notifikácie...");
      await unsubscribeFromPushNotifications(activeHousehold.publicToken);
      setPushEnabled(false);
      setPushStatus("Push notifikácie sú vypnuté pre toto zariadenie.");
    } catch (error) {
      setPushStatus(error instanceof Error ? error.message : "Push notifikácie sa nepodarilo vypnúť.");
    }
  };

  const handleQrPdfExport = async () => {
    if (allFlowers.length === 0) {
      setQrExportStatus("Nie sú dostupné žiadne rastliny na export.");
      return;
    }

    try {
      setQrExportStatus("Generujem PDF hárok...");
      await exportQrLabelsPdf(allFlowers, baseUrl);
      setQrExportStatus("PDF je pripravené. Pri tlači zvoľ 100 % veľkosť / Actual size.");
    } catch (error) {
      setQrExportStatus(error instanceof Error ? error.message : "PDF export zlyhal.");
    }
  };

  const updateCareRecord = async (flowerId: string, patch: Partial<FlowerRecords[string]>, message = "") => {
    const supabasePlantId = supabasePlantIdsByLegacyId[flowerId];
    if (supabaseWriteMode === "supabase-first" && supabasePlantId) {
      await writeSupabaseFirst(
        () => updateSupabaseCareRecord(supabasePlantId, patch),
        () => updateRecord(flowerId, patch),
        "Supabase care record write failed. Change is saved to legacy storage.",
      );
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
        "Supabase plant write failed. Change is saved to legacy storage.",
      );
      if (result && message) {
        setQuickRecordStatus(message);
      }
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
        "Supabase custom plant write failed. Plant is saved to legacy storage.",
      );
      return;
    }

    addCustomFlower(flower);
  };

  const removeFlowerById = async (flowerId: string) => {
    if (supabaseWriteMode === "supabase-first" && supabaseReadState) {
      await writeSupabaseFirst(
        () => setSupabasePlantRemoved(supabaseReadState.household.id, flowerId, true),
        () => removeFlower(flowerId),
        "Supabase plant removal failed. Removal is saved to legacy storage.",
      );
      return;
    }

    removeFlower(flowerId);
  };

  const runSupabaseComparison = () => {
    if (!supabaseReadState) {
      setSupabaseCompareResult(null);
      return;
    }

    setSupabaseCompareResult(compareLegacyAndSupabaseHouseholdState(legacyHouseholdState, supabaseReadState));
  };

  const handleCreateHousehold = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isCreatingHousehold) {
      return;
    }

    try {
      setIsCreatingHousehold(true);
      setAccessStatus("Vytváram súkromnú domácnosť...");
      const response = await fetch("/.netlify/functions/household-access", {
        body: JSON.stringify({ name: householdNameDraft }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Household could not be created.");
      }

      const data = (await response.json()) as { household?: HouseholdSession };
      if (!data.household || !isValidHouseholdToken(data.household.publicToken)) {
        throw new Error("Invalid household response.");
      }

      storeHouseholdSession(data.household);
      window.history.replaceState(null, "", createHouseholdUrl(data.household.publicToken));
      setActiveHousehold(data.household);
      setBaseUrl(currentHouseholdBaseUrl(data.household.publicToken));
      setAccessStatus("");
    } catch {
      setAccessStatus("Domácnosť sa nepodarilo vytvoriť. Skontroluj Netlify backend a skús znova.");
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
      setHouseholdLinkStatus("Link domácnosti je skopírovaný.");
    } catch {
      setHouseholdLinkStatus(link);
    }
  };

  const changeHousehold = () => {
    clearHouseholdSession();
    removeHouseholdFromCurrentUrl();
    setActiveHousehold(null);
    setCloudSyncEnabled(false);
    setCloudSyncReady(false);
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

  const handleAddCustomFlower = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const plantName = newPlantName.trim();

    if (!plantName || !newPlantImage) {
      setNewPlantStatus("Zadaj názov rastliny a pridaj obrázok.");
      return;
    }

    setIsAddingPlant(true);
    setNewPlantStatus("Spracúvam obrázok a generujem starostlivosť cez AI...");

    try {
      const imageDataUrl = newPlantImage.dataUrl;
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
      setNewPlantStatus(`AI identifikovala rastlinu ako ${customFlower.displayName}. Rastlina je pridaná.`);
      setNewPlantName("");
      URL.revokeObjectURL(newPlantImage.previewUrl);
      setNewPlantImage(null);
      setIsAddPlantModalOpen(false);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Rastlinu sa nepodarilo pridať.";
      setNewPlantStatus(`AI identifikácia zlyhala. Rastlina nebola pridaná. ${reason}`);
    } finally {
      setIsAddingPlant(false);
    }
  };

  const handleGenerateCarePreview = async (flower: Flower) => {
    setIsGeneratingCarePreview(true);
    setCarePreviewStatus("AI pripravuje nový návrh starostlivosti...");

    try {
      const imageDataUrl = await imageSourceToDataUrl(flower.image);
      const nextCare = await fetchGeneratedCare(flower.displayName, imageDataUrl);
      setCarePreview({ flowerId: flower.id, nextCare });
      setCarePreviewStatus("");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "AI návrh sa nepodarilo vygenerovať.";
      setCarePreviewStatus(`AI generovanie zlyhalo. ${reason}`);
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
      setCarePreviewStatus("Rastlina už nie je dostupná.");
      return;
    }

    void saveFlower(applyGeneratedCareToFlower(currentFlower, carePreview.nextCare), "Plant care updated.");
    setCarePreview(null);
    setCarePreviewStatus("Starostlivosť bola aktualizovaná podľa AI návrhu.");
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
    try {
      setNewPlantStatus("SpracĂşvam fotku...");
      const image = await captureImage({ file, source });
      if (newPlantImage?.previewUrl) {
        URL.revokeObjectURL(newPlantImage.previewUrl);
      }
      setNewPlantImage(image);
      setNewPlantStatus("Fotka je pripravenĂˇ.");
    } catch (error) {
      setNewPlantImage(null);
      setNewPlantStatus(error instanceof Error ? error.message : "Fotku sa nepodarilo spracovaĹĄ.");
    }
  };

  const handleDiagnosisImageChange = async (source: "camera" | "gallery", file?: File) => {
    if (!file && source === "gallery") {
      return;
    }

    try {
      setDiagnosisStatus("Spracúvam fotku...");
      setDiagnosisDraft(null);
      const image = await captureImage({ file, source });
      if (diagnosisImagePreviewUrl) {
        URL.revokeObjectURL(diagnosisImagePreviewUrl);
      }
      setDiagnosisImageDataUrl(image.dataUrl);
      setDiagnosisImagePreviewUrl(image.previewUrl);
      setDiagnosisStatus("Fotka je pripravená na AI diagnostiku.");
    } catch (error) {
      if (diagnosisImagePreviewUrl) {
        URL.revokeObjectURL(diagnosisImagePreviewUrl);
      }
      setDiagnosisImageDataUrl("");
      setDiagnosisImagePreviewUrl("");
      setDiagnosisStatus(error instanceof Error ? error.message : "Fotku sa nepodarilo spracovať.");
    }
  };

  const runPlantDiagnosis = async (flower: Flower) => {
    if (!diagnosisImageDataUrl || isDiagnosing) {
      return;
    }

    setIsDiagnosing(true);
    setDiagnosisStatus("Overujem Premium pr?stup...");

    try {
      const gate = await checkDiagnosisGate({
        isAuthenticated: auth.isAuthenticated,
        wasLegacyDiagnosisAvailable: true,
      });

      if (!gate.allowed) {
        setDiagnosisUpgradeReason(gate.message);
        setDiagnosisStatus(gate.message);
        return;
      }

      setDiagnosisStatus("AI analyzuje fotku rastliny...");
      const diagnosis = await fetchPlantDiagnosis(flower.displayName, diagnosisImageDataUrl, diagnosisSymptomNotes);
      setDiagnosisDraft(diagnosis);
      await recordDiagnosisUsage(gate.mode);
      setDiagnosisStatus(diagnosis.confidence < 45 ? "V?sledok m? n?zku istotu. Skontroluj ho opatrne." : "");
    } catch (error) {
      setDiagnosisDraft(null);
      setDiagnosisStatus(error instanceof Error ? error.message : "AI diagnostika zlyhala. Sk?s in? fotku.");
    } finally {
      setIsDiagnosing(false);
    }
  };

  const savePlantDiagnosis = async (flower: Flower, userConfirmation: DiagnosisConfirmation) => {
    if (!diagnosisDraft || !diagnosisImageDataUrl || !flowerById.has(flower.id)) {
      setDiagnosisStatus("Diagnostiku sa nepodarilo ulo?i?, rastlina u? nie je dostupn?.");
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
        setDiagnosisStatus("Supabase ulo?enie zlyhalo. Diagnostiku uklad?m lok?lne pre sp?tn? kompatibilitu.");
      }
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
        setDiagnosisStatus("Zmena je ulo?en? lok?lne. Supabase synchroniz?cia zlyhala.");
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
  };

  if (isAccessChecking) {
    return (
      <main className="app-shell access-shell">
        <section className="access-card" aria-live="polite">
          <div className="section-title">
            <Home size={20} aria-hidden="true" />
            <h1>Načítavam domácnosť</h1>
          </div>
          <p>Overujem súkromný link pred načítaním rastlín.</p>
        </section>
      </main>
    );
  }

  if (!activeHousehold) {
    return (
      <main className="app-shell access-shell">
        <section className="access-card" aria-labelledby="access-title">
          <div className="section-title">
            <Home size={20} aria-hidden="true" />
            <h1 id="access-title">Súkromná domácnosť</h1>
          </div>
          <p>
            Rastliny sa už nezdieľajú globálne pre celý web. Otvor zdieľaný link domácnosti alebo vytvor nový súkromný
            link pre svoju domácnosť.
          </p>
          <form className="access-form" onSubmit={handleCreateHousehold}>
            <label className="field">
              <span>Názov domácnosti</span>
              <input
                type="text"
                value={householdNameDraft}
                maxLength={80}
                onChange={(event) => setHouseholdNameDraft(event.target.value)}
              />
            </label>
            <button type="submit" disabled={isCreatingHousehold}>
              <Plus size={18} aria-hidden="true" />
              {isCreatingHousehold ? "Vytváram..." : "Vytvoriť domácnosť"}
            </button>
          </form>
          {accessStatus ? <p className="access-status">{accessStatus}</p> : null}
          <p className="access-note">
            Link bude obsahovať náhodný tajný token. Pošli ho iba ľuďom, ktorí majú mať prístup k týmto rastlinám.
          </p>
        </section>
      </main>
    );
  }

  if (route.page === "detail") {
    const flower = flowerById.get(route.flowerId);
    if (!flower) {
      return (
        <main className="app-shell compact">
          <a className="nav-link" href="#/">
            <ArrowLeft size={18} aria-hidden="true" />
            Prehľad
          </a>
          <section className="empty-state">
            <Leaf size={34} aria-hidden="true" />
            <h1>Rastlina sa nenašla</h1>
            <p>Tento QR kód smeruje na rastlinu, ktorá nie je v katalógu.</p>
          </section>
        </main>
      );
    }

    const record = records[flower.id] ?? { lastFertilized: "", note: "", lastWatered: "", lastTransplanted: "" };
    const elapsedDays = daysSince(record.lastWatered);
    const detailUrl = publicFlowerUrl(baseUrl, flower.id);
    const intervalDays = flower.wateringIntervalDays ?? wateringIntervalsDays[flower.id] ?? 7;
    const wateringProgress = getWateringProgress(record.lastWatered, intervalDays);
    const quickActionLabel = route.scan ? "Naskenovaná rastlina" : "Rýchly záznam";
    const activeCarePreview = carePreview?.flowerId === flower.id ? carePreview : null;
    const careDiffRows = activeCarePreview ? getCareDiffRows(flower, activeCarePreview.nextCare, intervalDays) : [];
    const isEditingName = editingNameFlowerId === flower.id;
    const flowerDiagnostics = diagnostics.filter((diagnosis) => diagnosis.plantId === flower.id);

    return (
      <main className="app-shell detail-shell">
        <header className="detail-header">
          <a className="icon-link" href="#/" aria-label="Späť na prehľad">
            <ArrowLeft size={22} aria-hidden="true" />
          </a>
          <div>
            <p className="eyebrow">Detail rastliny</p>
            {isEditingName ? (
              <div className="plant-name-editor">
                <input
                  type="text"
                  value={draftFlowerName}
                  maxLength={70}
                  aria-label="Názov rastliny"
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
                  aria-label="Uložiť názov rastliny"
                >
                  <Check size={18} aria-hidden="true" />
                </button>
                <button className="name-edit-action" type="button" onClick={cancelNameEdit} aria-label="Zrušiť úpravu názvu">
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <div className="plant-title-row">
                <h1>{flower.displayName}</h1>
                <button className="name-edit-button" type="button" onClick={() => startNameEdit(flower)} aria-label="Upraviť názov rastliny">
                  <Pencil size={18} aria-hidden="true" />
                </button>
              </div>
            )}
            <p className="plant-latin-name">{flower.likelyName}</p>
          </div>
        </header>

        <img className="detail-photo" src={flower.image} alt={flower.displayName} />

        <section className="scan-action-panel" aria-labelledby="quick-action-title">
          <div>
            <span>{quickActionLabel}</span>
            <h2 id="quick-action-title">Čo sa dnes udialo?</h2>
            <p>Ulož dnešný dátum zálievky, presadenia alebo hnojenia jedným klepnutím.</p>
          </div>
          <div className="scan-action-buttons">
            <button
              className={`primary-action ${quickRecordStatus === "Zálievka uložená" ? "quick-action-saved" : ""}`}
              type="button"
              onClick={() => saveQuickRecord(flower.id, { lastWatered: todayIsoDate() }, "Zálievka uložená")}
            >
              <Droplets size={18} aria-hidden="true" />
              Zaliata dnes
            </button>
            <button className="ghost-action" type="button" onClick={openDiagnosisModal}>
              <Camera size={18} aria-hidden="true" />
              Diagnostikova? probl?m
            </button>
            <a className="ghost-action action-link-button" href="#care-title">
              <Leaf size={18} aria-hidden="true" />
              Tipy starostlivosti
            </a>
            <button
              className={`ghost-action ${quickRecordStatus === "Presadenie uložené" ? "quick-action-saved" : ""}`}
              type="button"
              onClick={() => saveQuickRecord(flower.id, { lastTransplanted: todayIsoDate() }, "Presadenie uložené")}
            >
              <Sprout size={18} aria-hidden="true" />
              Presadená dnes
            </button>
            <button
              className={`ghost-action ${quickRecordStatus === "Hnojenie uložené" ? "quick-action-saved" : ""}`}
              type="button"
              onClick={() => saveQuickRecord(flower.id, { lastFertilized: todayIsoDate() }, "Hnojenie uložené")}
            >
              <Leaf size={18} aria-hidden="true" />
              Pohnojená dnes
            </button>
            <div className={`quick-save-feedback ${quickRecordStatus ? "quick-save-feedback-visible" : ""}`} aria-live="polite">
              <Check size={16} aria-hidden="true" />
              {quickRecordStatus || "Záznam uložený"}
            </div>
          </div>
        </section>

        <section className="diagnosis-panel" aria-labelledby="diagnosis-title">
          <div>
            <div className="section-title">
              <Camera size={18} aria-hidden="true" />
              <h2 id="diagnosis-title">AI diagnostika problému</h2>
            </div>
            <p>Ak listy žltnú, hnednú alebo rastlina vädne, odfoť postihnutú časť a ulož výsledok do histórie.</p>
          </div>
          <button type="button" onClick={openDiagnosisModal}>
            <Camera size={18} aria-hidden="true" />
            Rastlina vyzerá zle
          </button>
        </section>

        {flower.identification === "confident" ? null : (
          <section className={`identity-note identity-note-${flower.identification}`}>
            <BadgeCheck size={18} aria-hidden="true" />
            <div>
              <strong>{identificationLabel[flower.identification]}</strong>
              <span>{flower.identificationNote}</span>
            </div>
          </section>
        )}

        <section className="status-band">
          <div>
            <span>Posledná zálievka</span>
            <strong>{formatDate(record.lastWatered)}</strong>
          </div>
          <div>
            <span>Čas od zálievky</span>
            <strong>{formatElapsedDays(elapsedDays)}</strong>
          </div>
          <div>
            <span>Presadené</span>
            <strong>{formatDate(record.lastTransplanted)}</strong>
          </div>
          <div>
            <span>Pohnojené</span>
            <strong>{formatDate(record.lastFertilized)}</strong>
          </div>
        </section>

        <section className={`watering-panel watering-panel-${wateringProgress.state}`}>
          <div className="watering-panel-header">
            <div>
              <span>Stav zálievky</span>
              <strong>{Math.round(wateringProgress.percent)} %</strong>
            </div>
            <div>
              <span>Ďalšia zálievka</span>
              <strong>{formatDate(wateringProgress.nextWatering)}</strong>
            </div>
          </div>
          <div className="watering-progress-track" aria-label={`Stav zálievky ${Math.round(wateringProgress.percent)} percent`}>
            <div
              className="watering-progress-fill"
              style={{ width: `${wateringProgress.percent}%` }}
            />
          </div>
          <div className="watering-panel-footer">
            <span>Interval: každých {intervalDays} dní</span>
            <strong>{wateringProgress.statusText}</strong>
          </div>
        </section>

        <section className="care-panel" aria-labelledby="care-title">
          <div className="section-title">
            <Leaf size={18} aria-hidden="true" />
            <h2 id="care-title">Základná starostlivosť</h2>
            <button
              className="ai-care-button"
              type="button"
              disabled={isGeneratingCarePreview}
              onClick={() => handleGenerateCarePreview(flower)}
            >
              <Sparkles size={16} aria-hidden="true" />
              {isGeneratingCarePreview ? "Generujem..." : "Generovať AI"}
            </button>
          </div>
          {carePreviewStatus ? <p className="care-preview-status">{carePreviewStatus}</p> : null}
          <p className="care-summary">{flower.shortCare}</p>
          <div className="care-pill-grid" aria-label="Rýchly profil starostlivosti">
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
                <span>Svetlo</span>
              </dt>
              <dd>{flower.light}</dd>
            </div>
            <div>
              <dt>
                {getCarePillVisual("Zálievka", flower.watering, intervalDays)}
                <span>Zálievka</span>
              </dt>
              <dd>{flower.watering}</dd>
            </div>
            <div>
              <dt>
                {getCarePillVisual("Presádzanie", flower.soil, intervalDays)}
                <span>Substrát</span>
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
            <h2 id="care-log-title">Záznam starostlivosti</h2>
          </div>
          <label className="toggle-field">
            <span>
              <Bell size={18} aria-hidden="true" />
              Notifikácie pre túto rastlinu
            </span>
            <input
              type="checkbox"
              checked={flower.notificationsEnabled !== false}
              onChange={(event) => void saveFlower({ ...flower, notificationsEnabled: event.target.checked, source: "custom" })}
            />
          </label>
          <label className="field">
            <span>Interval z?lievky pre pripomienky</span>
            <input
              type="number"
              min={1}
              max={90}
              value={intervalDays}
              onChange={(event) => {
                const settings = normalizeReminderSettings({
                  notificationsEnabled: flower.notificationsEnabled !== false,
                  preference: "web_push",
                  wateringIntervalDays: Number(event.target.value),
                });
                void saveFlower({ ...flower, wateringIntervalDays: settings.wateringIntervalDays, source: "custom" });
              }}
            />
            <small>{getReminderArchitectureNote()}</small>
          </label>
          <label className="field">
            <span>Preferencia pripomienok</span>
            <select value="web_push" disabled>
              <option value="web_push">Web push teraz, native push nesk?r</option>
            </select>
          </label>
          <label className="field">
            <span>Dátum poslednej zálievky</span>
            <div className="date-row">
              <input
                type="date"
                value={record.lastWatered}
                max="9999-12-31"
                onChange={(event) => void updateCareRecord(flower.id, { lastWatered: event.target.value })}
              />
              <button type="button" onClick={() => void updateCareRecord(flower.id, { lastWatered: todayIsoDate() })}>
                Dnes
              </button>
            </div>
          </label>
          <label className="field">
            <span>Dátum presadenia</span>
            <div className="date-row">
              <input
                type="date"
                value={record.lastTransplanted}
                max="9999-12-31"
                onChange={(event) => void updateCareRecord(flower.id, { lastTransplanted: event.target.value })}
              />
              <button type="button" onClick={() => void updateCareRecord(flower.id, { lastTransplanted: todayIsoDate() })}>
                Dnes
              </button>
            </div>
          </label>
          <label className="field">
            <span>Dátum pohnojenia</span>
            <div className="date-row">
              <input
                type="date"
                value={record.lastFertilized}
                max="9999-12-31"
                onChange={(event) => void updateCareRecord(flower.id, { lastFertilized: event.target.value })}
              />
              <button type="button" onClick={() => void updateCareRecord(flower.id, { lastFertilized: todayIsoDate() })}>
                Dnes
              </button>
            </div>
          </label>
          <label className="field">
            <span>Poznámka</span>
            <textarea
              rows={5}
              placeholder="Pozorovania, plán presadenia alebo čokoľvek užitočné."
              value={record.note}
              onChange={(event) => void updateCareRecord(flower.id, { note: event.target.value })}
            />
          </label>
        </section>

        <section className="diagnostic-history-panel" aria-labelledby="diagnostic-history-title">
          <div className="section-title">
            <Camera size={18} aria-hidden="true" />
            <h2 id="diagnostic-history-title">História diagnostiky</h2>
          </div>
          {flowerDiagnostics.length === 0 ? (
            <p>Zatiaľ tu nie je uložená žiadna diagnostika.</p>
          ) : (
            <div className="diagnostic-history-list">
              {flowerDiagnostics.map((diagnosis) => {
                const isOpen = openDiagnosticId === diagnosis.id;
                return (
                  <article className={`diagnostic-history-card diagnostic-risk-${diagnosis.riskLevel}`} key={diagnosis.id}>
                    {diagnosis.imageDataUrl ? (
                      <img src={diagnosis.imageDataUrl} alt={`Diagnostika ${diagnosis.diagnosisTitle}`} />
                    ) : (
                      <div className="diagnostic-image-placeholder">Supabase</div>
                    )}
                    <div>
                      <span>{formatDate(diagnosis.createdAt.slice(0, 10))}</span>
                      <h3>{diagnosis.diagnosisTitle}</h3>
                      <p>
                        {diagnosis.confidence}% - {diagnosis.confidenceLabel} istota ? {riskLevelLabel(diagnosis.riskLevel)} ? {" "}
                        {diagnosis.userConfirmation === "confirmed" ? "potvrden?" : "zamietnut?"}
                      </p>
                      <button className="text-action" type="button" onClick={() => setOpenDiagnosticId(isOpen ? "" : diagnosis.id)}>
                        {isOpen ? "Skry? detail" : "Otvori? detail"}
                      </button>
                      {isOpen ? (
                        <div className="diagnostic-detail">
                          <section>
                            <h4>Detegovan? sympt?my</h4>
                            <ul>
                              {diagnosis.observedSymptoms.map((symptom) => (
                                <li key={symptom}>{symptom}</li>
                              ))}
                            </ul>
                          </section>
                          <section>
                            <h4>Odpor??an? kroky</h4>
                            <ol>
                              {diagnosis.recommendedSteps.map((step) => (
                                <li key={step}>{step}</li>
                              ))}
                            </ol>
                          </section>
                          <section>
                            <h4>Pravdepodobn? pr??iny</h4>
                            <p>{diagnosis.reasoningSummary}</p>
                          </section>
                          <small>{diagnosis.disclaimer}</small>
                          <label className="field">
                            <span>Osobn? pozn?mka</span>
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
                              Potvrdi?
                            </button>
                            <button
                              className="neutral-action"
                              type="button"
                              onClick={() => void updateDiagnosticHistoryEntry(diagnosis.id, { userConfirmation: "rejected" })}
                            >
                              Zamietnu?
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
                      {diagnosis.userNote && !isOpen ? <small>Pozn?mka: {diagnosis.userNote}</small> : null}
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
              <h2 id="single-qr-title">QR kód rastliny</h2>
            </div>
            <p>Po naskenovaní sa otvorí presne táto stránka rastliny.</p>
          </div>
          <QrCode value={detailUrl} label={flower.displayName} />
        </section>

        <section className="danger-panel" aria-labelledby="delete-plant-title">
          <div>
            <div className="section-title danger-title">
              <Trash2 size={18} aria-hidden="true" />
              <h2 id="delete-plant-title">Odstrániť rastlinu</h2>
            </div>
            <p>Táto akcia odstráni rastlinu z tvojho zoznamu, dashboardu, QR exportu aj reportu.</p>
          </div>
          <button type="button" onClick={() => setDeleteFlowerId(flower.id)}>
            <Trash2 size={18} aria-hidden="true" />
            Odstrániť rastlinu
          </button>
        </section>

        {activeCarePreview ? (
          <div className="modal-backdrop" role="presentation">
            <section className="care-preview-modal" role="dialog" aria-modal="true" aria-labelledby="care-preview-title">
              <button className="modal-close" type="button" onClick={() => setCarePreview(null)} aria-label="Zavrieť">
                <X size={20} aria-hidden="true" />
              </button>
              <div className="section-title">
                <Sparkles size={20} aria-hidden="true" />
                <h2 id="care-preview-title">AI návrh starostlivosti</h2>
              </div>
              <p>
                Skontroluj zmeny pre rastlinu „{flower.displayName}”. Aktualizácia sa uloží až po potvrdení.
              </p>

              {careDiffRows.length > 0 ? (
                <div className="care-diff-list" aria-label="Zmeny v starostlivosti">
                  {careDiffRows.map((row) => (
                    <article className="care-diff-row" key={row.label}>
                      <h3>{row.label}</h3>
                      <div>
                        <span>Pôvodne</span>
                        <p>{row.currentValue}</p>
                      </div>
                      <div>
                        <span>Nahradiť za</span>
                        <p>{row.nextValue}</p>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="care-diff-empty">
                  <BadgeCheck size={18} aria-hidden="true" />
                  AI nevrátila žiadne rozdiely oproti aktuálnej starostlivosti.
                </div>
              )}

              <div className="care-update-question">
                <strong>Chceš updatnúť info podľa tohto AI návrhu?</strong>
              </div>
              <div className="modal-actions">
                <button className="primary-action" type="button" onClick={confirmCareUpdate} disabled={careDiffRows.length === 0}>
                  Áno, updatnúť
                </button>
                <button className="neutral-action" type="button" onClick={() => setCarePreview(null)}>
                  Nie
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {isDiagnosisModalOpen ? (
          <div className="modal-backdrop" role="presentation">
            <section className="diagnosis-modal" role="dialog" aria-modal="true" aria-labelledby="diagnosis-modal-title">
              <button className="modal-close" type="button" onClick={closeDiagnosisModal} aria-label="Zavrieť">
                <X size={20} aria-hidden="true" />
              </button>
              <div className="section-title">
                <Camera size={20} aria-hidden="true" />
                <h2 id="diagnosis-modal-title">Rastlina vyzerá zle</h2>
              </div>
              <p>Pridaj ostrú fotku postihnutého listu alebo časti rastliny. AI výsledok je iba odhad.</p>

              <label className="field">
                <span>Sympt?my alebo pozn?mky</span>
                <textarea
                  rows={3}
                  value={diagnosisSymptomNotes}
                  maxLength={600}
                  placeholder="Napr. ?lt? listy, m?kk? stonka, ?kvrny, posledn? z?lievka..."
                  onChange={(event) => setDiagnosisSymptomNotes(event.target.value)}
                />
              </label>

              <label className="diagnosis-upload">
                <span className="image-upload-icon">
                  <ImagePlus size={19} aria-hidden="true" />
                </span>
                <span className="image-upload-copy">
                  <strong>Vybrat alebo odfotit problem</strong>
                  <small>JPG, PNG, WEBP · max 8 MB</small>
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
                    Odfotit
                  </button>
                  <button className="ghost-action" type="button" onClick={() => void handleDiagnosisImageChange("gallery")}>
                    <ImagePlus size={17} aria-hidden="true" />
                    Galeria
                  </button>
                </div>
              ) : null}

              {diagnosisImageDataUrl ? <img className="diagnosis-preview" src={diagnosisImagePreviewUrl || diagnosisImageDataUrl} alt="Náhľad diagnostickej fotky" /> : null}
              {diagnosisStatus ? <p className="care-preview-status">{diagnosisStatus}</p> : null}

              <button
                className="primary-action diagnosis-run-button"
                type="button"
                disabled={!diagnosisImageDataUrl || isDiagnosing}
                onClick={() => runPlantDiagnosis(flower)}
              >
                {isDiagnosing ? "Analyzujem..." : "Spustiť AI diagnostiku"}
              </button>

              {diagnosisDraft ? (
                <div className={`diagnosis-result diagnosis-risk-${diagnosisDraft.riskLevel}`}>
                  <div className="diagnosis-result-head">
                    <div>
                      <span>Diagnóza</span>
                      <h3>{diagnosisDraft.diagnosisTitle}</h3>
                      <small>{riskLevelLabel(diagnosisDraft.riskLevel)}</small>
                    </div>
                    <strong>
                      {diagnosisDraft.confidence}% – {diagnosisDraft.confidenceLabel} istota
                    </strong>
                  </div>
                  <div className="diagnosis-result-grid">
                    <section>
                      <h4>AI si všimla</h4>
                      <ul>
                        {diagnosisDraft.observedSymptoms.map((symptom) => (
                          <li key={symptom}>{symptom}</li>
                        ))}
                      </ul>
                    </section>
                    <section>
                      <h4>Odporúčané kroky</h4>
                      <ol>
                        {diagnosisDraft.recommendedSteps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    </section>
                  </div>
                  <section>
                    <h4>Prečo táto diagnóza</h4>
                    <p>{diagnosisDraft.reasoningSummary}</p>
                  </section>
                  <small>{diagnosisDraft.disclaimer}</small>
                  <label className="field">
                    <span>Upraviť poznámku pred uložením</span>
                    <textarea
                      rows={3}
                      value={diagnosisUserNote}
                      placeholder="Voliteľná vlastná poznámka k diagnostike."
                      onChange={(event) => setDiagnosisUserNote(event.target.value)}
                    />
                  </label>
                  <div className="modal-actions">
                    <button className="primary-action" type="button" onClick={() => savePlantDiagnosis(flower, "confirmed")}>
                      Uložiť diagnostiku
                    </button>
                    <button className="neutral-action" type="button" onClick={() => savePlantDiagnosis(flower, "rejected")}>
                      Nie je to správne
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
                <h2 id="delete-confirm-title">Naozaj si želáš danú rastlinu odstrániť?</h2>
              </div>
              <p>Rastlina „{flower.displayName}” sa odstráni z tvojho zoznamu. Táto akcia sa nedá vrátiť späť.</p>
              <div className="modal-actions">
                <button className="danger-action" type="button" onClick={confirmRemoveCustomFlower}>
                  Áno, odstrániť
                </button>
                <button className="neutral-action" type="button" onClick={() => setDeleteFlowerId("")}>
                  Nie
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </main>
    );
  }

  if (route.page === "account") {
    return (
      <main className="app-shell compact">
        <header className="topbar">
          <a className="icon-link" href="#/" aria-label="Sp?? na preh?ad">
            <ArrowLeft size={22} aria-hidden="true" />
          </a>
          <div>
            <p className="eyebrow">Plantie ??et</p>
            <h1>??et a Premium</h1>
          </div>
          <AuthButton />
        </header>
        <section className="mobile-product-card">
          <h2>Prihl?senie je st?le volite?n?</h2>
          <p>Legacy dom?cnostn? link, lok?lne d?ta a Netlify Blob sync zost?vaj? akt?vne. Premium sa aktivuje a? cez serverov? entitlementy.</p>
        </section>
        <section className="migration-card" aria-labelledby="data-source-title">
          <div className="section-title">
            <BadgeCheck size={18} aria-hidden="true" />
            <h2 id="data-source-title">Data source</h2>
          </div>
          <div className="migration-preview-grid">
            <span>Current source: {dataSourceLabel[dataSourceMode]}</span>
            <span>Supabase reads flag: {isSupabaseReadThroughEnabled ? "on" : "off"}</span>
            <span>Supabase writes flag: {isSupabaseWriteThroughEnvEnabled ? "on" : "off"}</span>
            <span>Local write rollback: {isSupabaseWritesLocallyDisabled ? "enabled" : "off"}</span>
            <span>Authenticated: {auth.isAuthenticated ? "yes" : "no"}</span>
            <span>Migrated household: {supabaseReadState ? "found" : "not found"}</span>
            <span>Supabase plants: {supabaseReadState?.allFlowers.length ?? 0}</span>
            <span>Report settings: {effectiveReportRecipient ? "present" : "missing"}</span>
          </div>
          <p className="report-status">
            {dataSourceMode === "supabase-readonly"
              ? "Supabase preview is read-only. Current write actions still use the legacy local and Netlify flow."
              : dataSourceMode === "supabase-readwrite"
                ? "Supabase is the primary read/write source. Successful writes are mirrored to legacy storage for rollback."
              : dataSourceMode === "error"
                ? "Supabase read failed, so the app is safely showing legacy data."
                : "Legacy data remains the active runtime source unless Supabase reads are enabled and a migrated authenticated household is available."}
          </p>
          {supabaseWriteWarning ? <p className="report-status">{supabaseWriteWarning}</p> : null}
          <button
            className="neutral-action"
            type="button"
            disabled={!isSupabaseWriteThroughEnvEnabled || isSupabaseWritesLocallyDisabled}
            onClick={disableSupabaseWritesLocally}
          >
            Disable Supabase write mode locally
          </button>
          <button
            className="primary-action"
            type="button"
            disabled={!supabaseReadState}
            onClick={runSupabaseComparison}
          >
            Compare legacy vs Supabase
          </button>
          {supabaseCompareResult ? (
            <div className="migration-result">
              <strong>Safe comparison summary</strong>
              <span>
                Plants: legacy {supabaseCompareResult.summary.legacyPlants} / Supabase{" "}
                {supabaseCompareResult.summary.supabasePlants}
              </span>
              <span>
                Care records: legacy {supabaseCompareResult.summary.legacyCareRecords} / Supabase{" "}
                {supabaseCompareResult.summary.supabaseCareRecords}
              </span>
              <span>
                Diagnostics: legacy {supabaseCompareResult.summary.legacyDiagnostics} / Supabase{" "}
                {supabaseCompareResult.summary.supabaseDiagnostics}
              </span>
              <span>
                Hidden or removed: legacy {supabaseCompareResult.summary.legacyHiddenOrRemovedPlants} / Supabase{" "}
                {supabaseCompareResult.summary.supabaseHiddenOrRemovedPlants}
              </span>
              <span>Missing legacy ID references: {supabaseCompareResult.missingLegacyIds.length}</span>
              <small>
                Mismatches:{" "}
                {[
                  supabaseCompareResult.plantCountMismatch ? "plant count" : "",
                  supabaseCompareResult.careRecordCountMismatch ? "care records" : "",
                  supabaseCompareResult.diagnosisCountMismatch ? "diagnostics" : "",
                  supabaseCompareResult.hiddenRemovedPlantMismatch ? "hidden/removed plants" : "",
                  supabaseCompareResult.missingLegacyIds.length > 0 ? "legacy IDs" : "",
                ]
                  .filter(Boolean)
                  .join(", ") || "none"}
              </small>
            </div>
          ) : null}
        </section>
        <LegacyMigrationCard
          activeHousehold={activeHousehold}
          allFlowers={legacyAllFlowersIncludingRemoved}
          customFlowers={customFlowers}
          diagnostics={legacyDiagnostics}
          isAuthenticated={auth.isAuthenticated}
          records={legacyRecords}
          removedFlowerIds={removedFlowerIds}
          reportSettings={{ recipientEmail: reportRecipient }}
        />
        <PricingPage />
        <MobileBottomNav />
      </main>
    );
  }

  if (route.page === "diagnose") {
    return (
      <main className="app-shell compact">
        <header className="topbar">
          <a className="icon-link" href="#/" aria-label="Sp?? na preh?ad">
            <ArrowLeft size={22} aria-hidden="true" />
          </a>
          <div>
            <p className="eyebrow">Premium pripraven?</p>
            <h1>Diagnostika rastliny</h1>
          </div>
        </header>
        <section className="diagnose-picker" aria-labelledby="diagnose-picker-title">
          <div className="section-title">
            <Camera size={18} aria-hidden="true" />
            <h2 id="diagnose-picker-title">Vyber rastlinu</h2>
          </div>
          <p>Otvor detail rastliny a pou?i akciu ?Rastlina vyzer? zle?. Prihl?sen? pou??vatelia musia ma? Premium entitlement zo Supabase.</p>
          <div className="diagnose-picker-list">
            {allFlowers.map((flower) => (
              <a className="diagnose-picker-card" href={flowerPath(flower.id, true)} key={flower.id}>
                <img src={flower.image} alt={flower.displayName} loading="lazy" />
                <div>
                  <strong>{flower.displayName}</strong>
                  <span>{flowerDiagnosticsCount(flower.id, diagnostics)} ulo?en?ch diagnost?k</span>
                </div>
              </a>
            ))}
          </div>
        </section>
        <MobileBottomNav />
      </main>
    );
  }

  if (route.page === "qr") {
    return (
      <main className="app-shell qr-shell">
        <header className="topbar">
          <a className="icon-link" href="#/" aria-label="Späť na prehľad">
            <ArrowLeft size={22} aria-hidden="true" />
          </a>
          <div>
            <p className="eyebrow">Tlačiteľné štítky</p>
            <h1>QR kódy</h1>
          </div>
          <div className="topbar-actions">
            <button className="icon-button" type="button" onClick={handleQrPdfExport} aria-label="Exportovať PDF QR štítky">
              <FileDown size={21} aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" onClick={() => window.print()} aria-label="Vytlačiť QR kódy">
              <Printer size={21} aria-hidden="true" />
            </button>
          </div>
        </header>

        <section className="base-url-panel">
          <label className="field">
            <span>Verejná URL aplikácie</span>
            <input
              type="url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://tvoja-cloud-aplikacia.example"
            />
          </label>
          <p>Pred tlačou zadaj finálnu cloud URL aplikácie. Každý QR kód otvorí správnu rastlinu.</p>
        </section>

        <section className="pdf-export-panel" aria-labelledby="pdf-export-title">
          <div className="section-title">
            <FileDown size={18} aria-hidden="true" />
            <h2 id="pdf-export-title">Print QR labels</h2>
          </div>
          {allFlowers.length > 0 ? (
            <>
              <p>
                PDF hárok A4 vytvorí čisté QR štítky {qrLabelSpec.labelSizeMm} × {qrLabelSpec.labelSizeMm} mm.
                Samotný QR kód má {qrLabelSpec.qrSizeMm} × {qrLabelSpec.qrSizeMm} mm a biely okraj aspoň {qrLabelSpec.quietZoneMm} mm.
              </p>
              <p className="print-note">Tlačte na 100 % veľkosť, bez prispôsobenia strane.</p>
              <div className="pdf-export-actions">
                <button type="button" onClick={handleQrPdfExport}>
                  <FileDown size={18} aria-hidden="true" />
                  Exportovať PDF
                </button>
                <span>{qrLabelValidation.message}</span>
              </div>
              {qrExportStatus ? <div className="report-status">{qrExportStatus}</div> : null}
            </>
          ) : (
            <p>Nie sú dostupné žiadne rastliny na export.</p>
          )}
        </section>

        <section className="qr-grid" aria-label="QR kódy pre všetky rastliny">
          {allFlowers.map((flower) => (
            <article className="qr-label" key={flower.id}>
              <QrCode value={publicFlowerUrl(baseUrl, flower.id)} label={flower.displayName} size={148} />
              <div>
                <strong>{flower.displayName}</strong>
                <span>{flower.id.replace("flower-", "#")}</span>
              </div>
            </article>
          ))}
        </section>
      </main>
    );
  }

  if (route.page === "report") {
    return (
      <main className="app-shell report-shell">
        <header className="topbar">
          <a className="icon-link" href="#/" aria-label="Späť na prehľad">
            <ArrowLeft size={22} aria-hidden="true" />
          </a>
          <div>
            <p className="eyebrow">Automatický email</p>
            <h1>Denný report</h1>
          </div>
        </header>

        <section className="report-panel" aria-labelledby="report-title">
          <div className="report-panel-header">
            <div className="section-title">
              <Mail size={18} aria-hidden="true" />
              <h2 id="report-title">Denný email report</h2>
            </div>
            <span className={cloudSyncEnabled ? "sync-pill sync-pill-ok" : "sync-pill"}>
              {cloudSyncEnabled ? "cloud aktívny" : "lokálny režim"}
            </span>
          </div>
          <p>
            Každý deň o 19:00 sa majú poslať iba rastliny pod {reportThresholdPercent} % zálievky.
            Rastliny nad {reportThresholdPercent} % sa do reportu nezahrnú.
          </p>
          <div className="household-panel household-panel-compact" aria-label="Aktívna domácnosť">
            <div>
              <span>Domácnosť</span>
              <strong>{activeHousehold.name}</strong>
              {householdLinkStatus ? <small>{householdLinkStatus}</small> : null}
            </div>
            <div className="household-actions">
              <button type="button" onClick={copyHouseholdLink}>
                <Copy size={17} aria-hidden="true" />
                Kopírovať link
              </button>
              <button type="button" onClick={changeHousehold}>
                Zmeniť domácnosť
              </button>
            </div>
          </div>
          <div className="push-settings">
            <div>
              <div className="section-title">
                {pushEnabled ? <Bell size={18} aria-hidden="true" /> : <BellOff size={18} aria-hidden="true" />}
                <h2>Mobilné push notifikácie</h2>
              </div>
              <p>
                Push notifikácia sa pošle ráno iba vtedy, keď sú rastliny na zálievku dnes. Prázdna notifikácia sa neposiela.
              </p>
              {pushStatus ? <small>{pushStatus}</small> : null}
            </div>
            <button type="button" onClick={pushEnabled ? disablePushNotifications : enablePushNotifications}>
              {pushEnabled ? "Vypnúť push" : "Zapnúť push"}
            </button>
          </div>
          <div className="report-settings">
            <label className="field">
              <span>Príjemca emailu</span>
              <input
                type="email"
                value={reportRecipient}
                placeholder="napr. meno@example.com"
                onChange={(event) => setReportRecipient(event.target.value)}
              />
            </label>
            <button type="button" onClick={saveReportRecipient}>
              Uložiť príjemcu
            </button>
            <a
              className={`report-mailto ${reportRecipient.trim() ? "" : "report-mailto-disabled"}`}
              href={reportRecipient.trim() ? createMailtoReportUrl(reportRecipient.trim(), records, allFlowers) : undefined}
              aria-disabled={!reportRecipient.trim()}
            >
              <Send size={17} aria-hidden="true" />
              Otvoriť email
            </a>
          </div>
          <div className="report-status">{reportStatus}</div>
          <div className="report-preview" aria-label="Náhľad reportu">
            <div className="report-preview-head">
              <strong>Rastliny v reporte</strong>
              <span>{reportRows.length}</span>
            </div>
            {reportRows.length > 0 ? (
              <div className="report-table" role="table" aria-label="Rastliny pod 20 percent zálievky">
                <div className="report-table-row report-table-row-head" role="row">
                  <span>Rastlina</span>
                  <span>Zálievka</span>
                  <span>Posledná zálievka</span>
                  <span>Stav</span>
                </div>
                {reportRows.map((row) => (
                  <div className="report-table-row" role="row" key={row.flower.id}>
                    <span>
                      <strong>{row.flower.displayName}</strong>
                      <small>{row.flower.likelyName}</small>
                    </span>
                    <span>{Math.round(row.progress.percent)} %</span>
                    <span>{row.lastWateredLabel}</span>
                    <span>{row.progress.statusText}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="report-empty">Žiadna rastlina nie je pod {reportThresholdPercent} % zálievky.</p>
            )}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">{allFlowers.length} sledovaných rastlín</p>
          <h1>Prehľad starostlivosti o rastliny</h1>
          <p className="hero-copy">Otvor rastlinu, aktualizuj zálievku alebo presadenie, pridaj poznámku a vytlač QR štítky na kvetináče.</p>
        </div>
        <div className="hero-actions">
          <AuthButton />
          <button className="qr-action add-plant-trigger" type="button" onClick={() => setIsAddPlantModalOpen(true)}>
            <Plus size={20} aria-hidden="true" />
            Pridať rastlinu
          </button>
          <a className="qr-action secondary-action-link" href="#/report">
            <Mail size={20} aria-hidden="true" />
            Report
          </a>
          <a className="qr-action" href="#/qr">
            <QrCodeIcon size={20} aria-hidden="true" />
            QR štítky
          </a>
        </div>
      </header>

      <section className="toolbar" aria-label="Nástroje prehľadu">
        <label className="search-field">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Hľadať rastliny</span>
          <input
            type="search"
            placeholder="Hľadať rastliny"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </section>

      <section className="household-panel" aria-label="Aktívna domácnosť">
        <div>
          <span>Domácnosť</span>
          <strong>{activeHousehold.name}</strong>
          {householdLinkStatus ? <small>{householdLinkStatus}</small> : null}
        </div>
        <div className="household-actions">
          <button type="button" onClick={copyHouseholdLink}>
            <Copy size={17} aria-hidden="true" />
            Kopírovať link
          </button>
          <button type="button" onClick={changeHousehold}>
            Zmeniť domácnosť
          </button>
        </div>
      </section>

      {isAddPlantModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="plant-modal" role="dialog" aria-modal="true" aria-labelledby="add-plant-title">
            <button className="modal-close" type="button" onClick={() => setIsAddPlantModalOpen(false)} aria-label="Zavrieť">
              <X size={20} aria-hidden="true" />
            </button>
            <div className="section-title">
              <Plus size={18} aria-hidden="true" />
              <h2 id="add-plant-title">Pridať novú rastlinu</h2>
            </div>
            <p>
              Zadaj názov a pridaj fotku. AI starostlivosť sa vygeneruje iba pre túto novú rastlinu;
              existujúce rastliny sa tým nemenia.
            </p>
            <form className="add-plant-form modal-form" onSubmit={handleAddCustomFlower}>
              <label className="field">
                <span>Názov rastliny</span>
                <input
                  type="text"
                  value={newPlantName}
                  maxLength={80}
                  placeholder="napr. Monstera"
                  onChange={(event) => setNewPlantName(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Obrázok rastliny</span>
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
                    <strong>{newPlantImage ? newPlantImage.name : "Vybrat fotku"}</strong>
                    <small>{newPlantImage ? "Fotka je pripravena" : "JPG, PNG, WEBP max 8 MB"}</small>
                  </span>
                </label>
                {isNativeImageRuntime ? (
                  <div className="image-capture-actions">
                    <button className="ghost-action" type="button" onClick={() => void handleNewPlantImageCapture("camera")}>
                      <Camera size={17} aria-hidden="true" />
                      Odfotit
                    </button>
                    <button className="ghost-action" type="button" onClick={() => void handleNewPlantImageCapture("gallery")}>
                      <ImagePlus size={17} aria-hidden="true" />
                      Galeria
                    </button>
                  </div>
                ) : null}
                {newPlantImage ? <img className="diagnosis-preview" src={newPlantImage.previewUrl} alt="Náhľad novej rastliny" /> : null}
              </label>
              <button type="submit" disabled={isAddingPlant}>
                <Plus size={18} aria-hidden="true" />
                {isAddingPlant ? "Pridávam..." : "Pridať rastlinu"}
              </button>
            </form>
            {newPlantStatus ? <div className="report-status">{newPlantStatus}</div> : null}
          </section>
        </div>
      ) : null}

      <section className="flower-grid" aria-label="Prehľad rastlín">
        {filteredFlowers.map((flower) => {
          const record = records[flower.id] ?? { lastFertilized: "", note: "", lastWatered: "", lastTransplanted: "" };
          const intervalDays = flower.wateringIntervalDays ?? wateringIntervalsDays[flower.id] ?? 7;
          const wateringProgress = getWateringProgress(record.lastWatered, intervalDays);

          return (
            <a className="flower-card" href={flowerPath(flower.id)} key={flower.id}>
              <img src={flower.image} alt={flower.displayName} loading="lazy" />
              <div className="flower-card-body">
                <div className="card-topline">
                  <span className="flower-index">{flower.id.replace("flower-", "#")}</span>
                  <span>{flower.identification === "confident" ? "overené ID" : flower.identification === "likely" ? "pravdepodobné ID" : "overiť ID"}</span>
                </div>
                <h2>{flower.displayName}</h2>
                <div className={`image-watering image-watering-${wateringProgress.state}`}>
                  <div className="image-watering-label">
                    <span>Zálievka</span>
                    <strong>{Math.round(wateringProgress.percent)} %</strong>
                  </div>
                  <div className="image-progress-track">
                    <div className="image-progress-fill" style={{ width: `${wateringProgress.percent}%` }} />
                  </div>
                  <small>{wateringProgress.statusText}</small>
                </div>
              </div>
            </a>
          );
        })}
      </section>

      {filteredFlowers.length === 0 ? (
        <section className="empty-state">
          <Home size={34} aria-hidden="true" />
          <h2>Žiadna rastlina sa nenašla</h2>
          <p>Vymaž vyhľadávanie a zobrazí sa celý dashboard.</p>
        </section>
      ) : null}
      <MobileBottomNav />
    </main>
  );
};
