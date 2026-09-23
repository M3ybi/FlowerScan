import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Camera,
  Check,
  ChevronRight,
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
import {
  currentBaseUrl,
  currentHouseholdBaseUrl,
  formatLocalizedDate,
  formatLocalizedElapsedDays,
  formatLocalizedWateringStatus,
  pageTitle,
  publicFlowerUrl,
  todayIsoDate,
} from "./app/appFormatting";
import {
  applyGeneratedCareToFlower,
  getCareDiffRows,
  getCarePillVisual,
} from "./app/carePresentation";
import type { CarePreview } from "./app/carePresentation";
import {
  createInviteUrl,
  inviteErrorMessage,
  isActiveInvite,
  isLikelyInviteToken,
  joinInviteErrorMessage,
  normalizeInviteTokenInput,
  safeInviteDebugMessage,
} from "./app/householdInvites";
import {
  diagnosticsStorageKey,
  flowerDiagnosticsCount,
  readStoredDiagnostics,
  riskLevelLabel,
} from "./app/localDiagnostics";
import { areStringRecordsEqual, mergeCloudRecords } from "./app/records";
import { isRouteAllowedWithoutHousehold, useHashRoute } from "./app/routes";
import { AppTabNav, MobileBottomNav } from "./components/AppNavigation";
import { AuthPanel } from "./components/AuthPanel";
import { LoadingButton } from "./components/LoadingButton";
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
import { captureImage, detectImageRuntime } from "./lib/imageCaptureService";
import type { NormalizedImage } from "./lib/imageCaptureService";
import { createTranslator, translate } from "./lib/i18n";
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
  invalidateSupabaseReadThroughCache,
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
  getUserHouseholds,
  isValidInviteEmail,
  joinHouseholdByInvite,
  listHouseholdInvites,
  listHouseholdMembers,
  normalizeInviteEmail,
  removeHouseholdViewer,
  renameHousehold,
  revokeHouseholdInvite,
  sendHouseholdInviteEmail,
} from "./lib/plantieRepository";
import type { Household, HouseholdInvite, HouseholdMember, HouseholdRole } from "./lib/plantieRepository";
import { householdNameMaxLength, validateHouseholdName } from "./lib/householdNameValidation";
import { resolveAiDiagnosisAccess } from "./lib/aiDiagnosisAccess";
import type { AiDiagnosisAccessResult } from "./lib/aiDiagnosisAccess";
import {
  assertCanAddPlant,
  getHouseholdPlanUsage,
  recordCareTipGeneration,
} from "./lib/householdPlanService";
import type { HouseholdPlanUsage } from "./lib/householdPlanService";
import { PLAN_LIMITS } from "./lib/householdPlanRules";
import {
  createCustomFlowerId,
  fetchGeneratedCare,
  imageSourceToDataUrl,
} from "./utils/customFlower";
import { daysSince, formatDate } from "./utils/dates";
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
  createDiagnosticId,
  fetchPlantDiagnosis,
  sanitizeDiagnosticNote,
  sanitizeDiagnosticEntries,
} from "./utils/diagnostics";
import { imageUploadRejectionMessage, validatePlantImageForUpload } from "./utils/imageUploadValidation";
import type { DiagnosisConfirmation, PlantDiagnosisDraft, PlantDiagnosticEntry } from "./utils/diagnostics";
import { callBackendFunction, isLegacyNetlifyBackendEnabled, isSupabaseBackend } from "./lib/backendConfig";

const isSupabaseReadThroughEnabled = isSupabaseConfigured && import.meta.env.VITE_DISABLE_SUPABASE_READS !== "true";
const isSupabaseWriteThroughEnvEnabled =
  isSupabaseReadThroughEnabled &&
  import.meta.env.VITE_DISABLE_SUPABASE_WRITES !== "true" &&
  import.meta.env.VITE_ENABLE_SUPABASE_WRITES !== "false";
const isSupabaseOnlyDataMode = isSupabaseReadThroughEnabled && isSupabaseBackend;
const supabaseWritesDisabledStorageKey = "plantie-disable-supabase-writes-v1";
const pendingInviteStorageKey = "plantie-pending-household-invite-v1";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type HouseholdNameEditSurface = "sheet" | "menu";

const isUuid = (value: string) => uuidPattern.test(value);

const getSupabaseDiagnosticId = (diagnostic: PlantDiagnosticEntry) =>
  diagnostic.supabaseId ?? (isUuid(diagnostic.id) ? diagnostic.id : "");

const logTechnicalError = (message: string, error: unknown) => {
  console.error(message, {
    error: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : "UnknownError",
  });
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
  const [householdNameEditDraft, setHouseholdNameEditDraft] = useState("");
  const [householdNameEditSurface, setHouseholdNameEditSurface] = useState<HouseholdNameEditSurface | null>(null);
  const [householdNameEditStatus, setHouseholdNameEditStatus] = useState("");
  const [householdNameEditStatusTone, setHouseholdNameEditStatusTone] = useState<"error" | "info" | "success">("info");
  const [isSavingHouseholdName, setIsSavingHouseholdName] = useState(false);
  const [isHouseholdSheetOpen, setIsHouseholdSheetOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<HouseholdRole>("editor");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");
  const [inviteStatusTone, setInviteStatusTone] = useState<"error" | "info" | "success">("info");
  const inviteStatusClass = inviteStatus ? `report-status invite-status invite-status-${inviteStatusTone}` : "";
  const [createdInviteLink, setCreatedInviteLink] = useState("");
  const [householdInvites, setHouseholdInvites] = useState<HouseholdInvite[]>([]);
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMember[]>([]);
  const [joinInviteInput, setJoinInviteInput] = useState("");
  const [isJoiningInvite, setIsJoiningInvite] = useState(false);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [revokeInviteId, setRevokeInviteId] = useState("");
  const [removingViewerId, setRemovingViewerId] = useState("");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isAccessChecking, setIsAccessChecking] = useState(true);
  const [householdLookupStatus, setHouseholdLookupStatus] = useState<HouseholdLookupStatus>("idle");
  const [isCreatingHousehold, setIsCreatingHousehold] = useState(false);
  const [, setReportRecipient] = useState(() => window.localStorage.getItem("flowscan-report-recipient-v1") ?? "");
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(false);
  const [cloudSyncReady, setCloudSyncReady] = useState(false);
  const [qrExportStatus, setQrExportStatus] = useState("");
  const [isExportingQrPdf, setIsExportingQrPdf] = useState(false);
  const [newPlantName, setNewPlantName] = useState("");
  const [newPlantImage, setNewPlantImage] = useState<NormalizedImage | null>(null);
  const [newPlantStatus, setNewPlantStatus] = useState("");
  const [isAddingPlant, setIsAddingPlant] = useState(false);
  const [isCapturingNewPlantImage, setIsCapturingNewPlantImage] = useState(false);
  const [isAddPlantModalOpen, setIsAddPlantModalOpen] = useState(false);
  const [plantPage, setPlantPage] = useState(1);
  const [deleteFlowerId, setDeleteFlowerId] = useState("");
  const [isRemovingPlant, setIsRemovingPlant] = useState(false);
  const [carePreview, setCarePreview] = useState<CarePreview | null>(null);
  const [carePreviewStatus, setCarePreviewStatus] = useState("");
  const [isGeneratingCarePreview, setIsGeneratingCarePreview] = useState(false);
  const [editingNameFlowerId, setEditingNameFlowerId] = useState("");
  const [draftFlowerName, setDraftFlowerName] = useState("");
  const [legacyDiagnostics, setDiagnostics] = useState<PlantDiagnosticEntry[]>(() => readStoredDiagnostics());
  const [isDiagnosisModalOpen, setIsDiagnosisModalOpen] = useState(false);
  const [diagnosisImageDataUrl, setDiagnosisImageDataUrl] = useState("");
  const [diagnosisImagePreviewUrl, setDiagnosisImagePreviewUrl] = useState("");
  const [diagnosisDraft, setDiagnosisDraft] = useState<PlantDiagnosisDraft | null>(null);
  const [diagnosisUserNote, setDiagnosisUserNote] = useState("");
  const [diagnosisStatus, setDiagnosisStatus] = useState("");
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [isSavingDiagnosis, setIsSavingDiagnosis] = useState(false);
  const [isCapturingDiagnosisImage, setIsCapturingDiagnosisImage] = useState(false);
  const [diagnosisSymptomNotes, setDiagnosisSymptomNotes] = useState("");
  const [diagnosisUpgradeReason, setDiagnosisUpgradeReason] = useState("");
  const [openDiagnosticId, setOpenDiagnosticId] = useState("");
  const [diagnosticHistoryStatus, setDiagnosticHistoryStatus] = useState("");
  const [pendingDiagnosticUpdateKey, setPendingDiagnosticUpdateKey] = useState("");
  const [deleteAccountContact, setDeleteAccountContact] = useState(() => auth.user?.email ?? "");
  const [deleteAccountStatus, setDeleteAccountStatus] = useState("");
  const [isRequestingAccountDeletion, setIsRequestingAccountDeletion] = useState(false);
  const [accountActionStatus, setAccountActionStatus] = useState("");
  const [healthEndpointStatus, setHealthEndpointStatus] = useState("");
  const [supabasePlantIdsByLegacyId, setSupabasePlantIdsByLegacyId] = useState<Record<string, string>>({});
  const [quickRecordStatus, setQuickRecordStatus] = useState("");
  const [pendingQuickRecordKey, setPendingQuickRecordKey] = useState("");
  const [supabaseReadState, setSupabaseReadState] = useState<SupabaseReadThroughState | null>(null);
  const [supabaseReadError, setSupabaseReadError] = useState(false);
  const [householdPlanUsage, setHouseholdPlanUsage] = useState<HouseholdPlanUsage | null>(null);
  const [householdPlanUsageHouseholdId, setHouseholdPlanUsageHouseholdId] = useState("");
  const previousAuthUserIdRef = useRef<string | null>(null);
  const activeSupabaseHouseholdIdRef = useRef("");
  const transientMessageGenerationRef = useRef(0);
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
  activeSupabaseHouseholdIdRef.current = activeSupabaseHouseholdId;
  const currentHouseholdPlanUsage = householdPlanUsageHouseholdId === activeSupabaseHouseholdId ? householdPlanUsage : null;
  const plantLimitReached = currentHouseholdPlanUsage?.plantsRemaining === 0;
  const plantLimitLabel = currentHouseholdPlanUsage
    ? currentHouseholdPlanUsage.isPremium
      ? "Premium: unlimited plants"
      : `${currentHouseholdPlanUsage.plantsRemaining ?? 0} / ${currentHouseholdPlanUsage.plantsLimit ?? 10} plants remaining on the free plan`
    : "";
  const accountSubscriptionLabel = currentHouseholdPlanUsage
    ? currentHouseholdPlanUsage.isPremium
      ? t("account.subscriptionPremium")
      : t("account.subscriptionFree")
    : t("account.subscriptionServer");
  const freeAiDiagnosisMonthlyLimit = PLAN_LIMITS.free.monthlyPlantUnwellAiAnalyzes ?? 10;
  const resolveCurrentAiDiagnosisAccess = () =>
    resolveAiDiagnosisAccess({
      activeHouseholdId: activeSupabaseHouseholdId,
      householdPlanUsage: currentHouseholdPlanUsage,
      isAuthenticated: auth.isAuthenticated,
      requiresSupabaseHousehold: isSupabaseBackend,
    });
  const aiDiagnosisAccessMessage = (access: AiDiagnosisAccessResult) => {
    if (access.allowed) {
      return "";
    }

    if (access.status === "auth_required") {
      return t("diagnosis.authRequired");
    }

    if (access.status === "household_required") {
      return t("diagnosis.householdRequired");
    }

    if (access.status === "limit_reached") {
      return t("diagnosis.limitReached", { limit: freeAiDiagnosisMonthlyLimit });
    }

    return t("diagnosis.accessChecking");
  };
  const aiDiagnosisDisabledActionLabel = (access: AiDiagnosisAccessResult) =>
    access.status === "limit_reached" ? t("diagnosis.limitReachedAction") : t("diagnosis.unavailableAction");
  const routeInviteToken = route.page === "join" ? route.invite : "";
  const currentRouteAllowedWithoutHousehold = isRouteAllowedWithoutHousehold(route);
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
  const currentUserEmail = auth.user?.email ?? t("account.noEmail");
  const currentHouseholdMember = householdMembers.find((member) => member.userId === auth.user?.id);
  const isCurrentHouseholdOwner = currentHouseholdMember?.role === "owner";
  const canRenameHousehold = auth.isAuthenticated && Boolean(activeSupabaseHouseholdId) && isCurrentHouseholdOwner;
  const householdNameEditStatusClass = householdNameEditStatus
    ? `household-name-edit-status household-name-edit-status-${householdNameEditStatusTone}`
    : "";
  const householdRoleLabel = (role: HouseholdRole) =>
    role === "editor" ? t("household.roleEditor") : role === "viewer" ? t("household.roleViewer") : t("household.roleOwner");
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
  const routeLifecycleKey =
    route.page === "detail"
      ? `detail:${route.flowerId}:${route.scan ? "scan" : "view"}:${route.panel}`
      : route.page === "menu"
        ? `menu:${route.section}`
        : route.page === "join"
          ? `join:${route.invite}`
          : route.page === "legal"
            ? `legal:${route.legalPageId}`
            : route.page;
  const householdLifecycleKey = activeSupabaseHouseholdId || activeHousehold?.publicToken || "";

  const clearTransientMessages = () => {
    transientMessageGenerationRef.current += 1;
    setAccessStatus("");
    setAccountActionStatus("");
    setCarePreviewStatus("");
    setCreatedInviteLink("");
    setDeleteAccountStatus("");
    setDiagnosticHistoryStatus("");
    setDiagnosisStatus("");
    setDiagnosisUpgradeReason("");
    setHouseholdNameEditDraft("");
    setHouseholdNameEditStatus("");
    setHouseholdNameEditStatusTone("info");
    setHouseholdNameEditSurface(null);
    setInviteStatus("");
    setInviteStatusTone("info");
    setNewPlantStatus("");
    setOnboardingStatus("");
    setQrExportStatus("");
    setQuickRecordStatus("");
    setCarePreview(null);
    setDeleteFlowerId("");
    setIsCreatingHousehold(false);
    setIsHouseholdSheetOpen(false);
    setIsSavingHouseholdName(false);
  };

  const isTransientMessageGenerationCurrent = (generation: number) =>
    generation === transientMessageGenerationRef.current;

  useEffect(() => {
    if (route.page === "detail" && route.panel === "diagnostics") {
      return;
    }

    window.scrollTo({ top: 0, left: 0 });
  }, [route.page, "flowerId" in route ? route.flowerId : "", "panel" in route ? route.panel : ""]);

  useEffect(() => {
    if (route.page !== "detail" || route.panel !== "diagnostics") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const panel = document.getElementById("diagnostic-history-panel");
      if (!panel) {
        return;
      }

      panel.scrollIntoView({ block: "start" });
      panel.focus({ preventScroll: true });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [route.page, "flowerId" in route ? route.flowerId : "", "panel" in route ? route.panel : ""]);

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
    clearTransientMessages();
  }, [routeLifecycleKey]);

  useEffect(() => {
    clearTransientMessages();
  }, [householdLifecycleKey]);

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
    clearTransientMessages();
    setSupabaseReadState(null);
    setSupabaseReadError(false);
    setSupabasePlantIdsByLegacyId({});
    setHouseholdPlanUsage(null);
    setHouseholdPlanUsageHouseholdId("");
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

    invalidateSupabaseReadThroughCache(activeHousehold);
    const nextState = await loadSupabaseReadThroughState(activeHousehold, { force: true });
    setSupabaseReadState(nextState);
    setSupabaseReadError(false);
    if (nextState) {
      setSupabasePlantIdsByLegacyId((current) =>
        areStringRecordsEqual(current, nextState.supabasePlantIdsByLegacyId) ? current : nextState.supabasePlantIdsByLegacyId,
      );
    }

    return nextState;
  };

  const refreshHouseholdPlanUsage = async (householdId = activeSupabaseHouseholdId) => {
    if (!auth.isAuthenticated || !householdId) {
      setHouseholdPlanUsage(null);
      setHouseholdPlanUsageHouseholdId("");
      return null;
    }

    const usage = await getHouseholdPlanUsage(householdId);
    if (activeSupabaseHouseholdIdRef.current === householdId) {
      setHouseholdPlanUsage(usage);
      setHouseholdPlanUsageHouseholdId(householdId);
    }
    return usage;
  };

  const writeSupabaseFirst = async <T,>(operation: () => Promise<T>, mirrorLegacy: () => void) => {
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
        await refreshHouseholdPlanUsage().catch(() => null);
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
      await refreshHouseholdPlanUsage().catch(() => null);
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
    const householdId = activeSupabaseHouseholdId;
    setHouseholdPlanUsage(null);
    setHouseholdPlanUsageHouseholdId("");

    if (!auth.isAuthenticated || !householdId) {
      setHouseholdPlanUsage(null);
      setHouseholdPlanUsageHouseholdId("");
      return;
    }

    void refreshHouseholdPlanUsage(householdId).catch(() => {
      if (activeSupabaseHouseholdIdRef.current === householdId) {
        setHouseholdPlanUsage(null);
        setHouseholdPlanUsageHouseholdId("");
      }
    });
  }, [activeSupabaseHouseholdId, auth.isAuthenticated, auth.user?.id]);

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

  const handleQrPdfExport = async () => {
    if (isExportingQrPdf) {
      return;
    }

    if (allFlowers.length === 0) {
      setQrExportStatus(t("qr.noPlantsExport"));
      return;
    }

    try {
      setIsExportingQrPdf(true);
      setQrExportStatus(t("qr.exportGenerating"));
      await exportQrLabelsPdf(allFlowers, baseUrl);
      setQrExportStatus(t("qr.exportReady"));
    } catch (error) {
      setQrExportStatus(error instanceof Error ? error.message : t("qr.exportFailed"));
    } finally {
      setIsExportingQrPdf(false);
    }
  };

  const applyRenamedHousehold = (household: Household) => {
    setSupabaseReadState((current) =>
      current?.household.id === household.id
        ? {
            ...current,
            household,
          }
        : current,
    );
    setActiveHousehold((current) => {
      if (!current || (current.publicToken !== household.id && current.publicToken !== household.legacyPublicToken)) {
        return current;
      }

      const next = { ...current, name: household.name };
      storeHouseholdSession(next);
      return next;
    });
    setPreviousHousehold((current) =>
      current && (current.publicToken === household.id || current.publicToken === household.legacyPublicToken)
        ? { ...current, name: household.name }
        : current,
    );
    setHouseholdNameDraft(household.name);
    invalidateSupabaseReadThroughCache();
  };

  const startHouseholdNameEdit = (surface: HouseholdNameEditSurface) => {
    setHouseholdNameEditDraft(householdDisplayName);
    setHouseholdNameEditStatus("");
    setHouseholdNameEditStatusTone("info");
    setHouseholdNameEditSurface(surface);
  };

  const cancelHouseholdNameEdit = () => {
    setHouseholdNameEditDraft("");
    setHouseholdNameEditStatus("");
    setHouseholdNameEditStatusTone("info");
    setHouseholdNameEditSurface(null);
  };

  const handleSaveHouseholdName = async () => {
    if (isSavingHouseholdName) {
      return;
    }

    if (!activeSupabaseHouseholdId || !isCurrentHouseholdOwner) {
      setHouseholdNameEditStatus(t("household.renamePermission"));
      setHouseholdNameEditStatusTone("error");
      return;
    }

    const nameValidation = validateHouseholdName(householdNameEditDraft);
    if (!nameValidation.valid && nameValidation.reason === "required") {
      setHouseholdNameEditStatus(t("household.renameRequired"));
      setHouseholdNameEditStatusTone("error");
      return;
    }

    if (!nameValidation.valid && nameValidation.reason === "too_long") {
      setHouseholdNameEditStatus(t("household.renameTooLong", { count: householdNameMaxLength }));
      setHouseholdNameEditStatusTone("error");
      return;
    }

    if (!nameValidation.valid) {
      setHouseholdNameEditStatus(t("household.renameUnsafe"));
      setHouseholdNameEditStatusTone("error");
      return;
    }

    const feedbackGeneration = transientMessageGenerationRef.current;

    try {
      setIsSavingHouseholdName(true);
      setHouseholdNameEditStatus(t("household.renameSaving"));
      setHouseholdNameEditStatusTone("info");
      const household = await renameHousehold(activeSupabaseHouseholdId, nameValidation.name);
      applyRenamedHousehold(household);
      if (!isTransientMessageGenerationCurrent(feedbackGeneration)) {
        return;
      }
      setHouseholdNameEditStatus(t("household.renameSaved"));
      setHouseholdNameEditStatusTone("success");
      setHouseholdNameEditSurface(null);
    } catch {
      if (isTransientMessageGenerationCurrent(feedbackGeneration)) {
        setHouseholdNameEditStatus(t("household.renameFailed"));
        setHouseholdNameEditStatusTone("error");
      }
    } finally {
      if (isTransientMessageGenerationCurrent(feedbackGeneration)) {
        setIsSavingHouseholdName(false);
      }
    }
  };

  const renderHouseholdNameEditor = (surface: HouseholdNameEditSurface, headingId?: string) => {
    const isEditing = householdNameEditSurface === surface;
    const inputId = `household-name-${surface}`;
    const statusId = `household-name-status-${surface}`;

    if (isEditing) {
      return (
        <form
          className="household-name-edit-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSaveHouseholdName();
          }}
        >
          <label className="sr-only" htmlFor={inputId}>
            {t("household.renameLabel")}
          </label>
          <input
            aria-describedby={householdNameEditStatus ? statusId : undefined}
            aria-invalid={householdNameEditStatusTone === "error"}
            autoFocus
            disabled={isSavingHouseholdName}
            id={inputId}
            maxLength={householdNameMaxLength}
            type="text"
            value={householdNameEditDraft}
            onChange={(event) => setHouseholdNameEditDraft(event.target.value)}
          />
          <div className="household-name-edit-actions">
            <LoadingButton
              className="household-icon-action household-icon-action-save"
              type="submit"
              isLoading={isSavingHouseholdName}
              loadingLabel={<span className="sr-only">{t("household.renameSaving")}</span>}
              aria-label={t("household.renameSave")}
            >
              <Check size={16} aria-hidden="true" />
            </LoadingButton>
            <button
              className="household-icon-action"
              type="button"
              disabled={isSavingHouseholdName}
              onClick={cancelHouseholdNameEdit}
              aria-label={t("household.renameCancel")}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          {householdNameEditStatus ? (
            <p id={statusId} className={householdNameEditStatusClass}>
              {householdNameEditStatus}
            </p>
          ) : null}
        </form>
      );
    }

    return (
      <div className="household-name-row">
        {headingId ? (
          <h2 id={headingId}>{householdDisplayName}</h2>
        ) : (
          <strong className="household-name-display">{householdDisplayName}</strong>
        )}
        {canRenameHousehold ? (
          <button className="household-name-edit-trigger" type="button" onClick={() => startHouseholdNameEdit(surface)} aria-label={t("household.renameAction")}>
            <Pencil size={15} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    );
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
            <div className="household-sheet-identity">
              <p className="eyebrow">{t("account.household")}</p>
              {renderHouseholdNameEditor("sheet", "household-sheet-title")}
              <p className="household-sheet-email">{currentUserEmail}</p>
              <span>{auth.isAuthenticated ? t("household.synced") : t("household.localGuest")}</span>
              {householdNameEditStatus && householdNameEditSurface !== "sheet" ? (
                <p className={householdNameEditStatusClass}>{householdNameEditStatus}</p>
              ) : null}
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
          <div className="household-sheet-actions">
            <a href="#/menu?section=household" onClick={() => setIsHouseholdSheetOpen(false)}>
              <Settings size={17} aria-hidden="true" />
              {t("household.settings")}
              <ChevronRight size={16} aria-hidden="true" />
            </a>
            {auth.isAuthenticated ? (
              <LoadingButton type="button" onClick={() => void handleAccountSignOut()} isLoading={isSigningOut} loadingLabel={t("account.signingOut")}>
                <UserRound size={17} aria-hidden="true" />
                {t("account.signOut")}
              </LoadingButton>
            ) : null}
          </div>
        </section>
      </div>
    ) : null;

  const renderHouseholdLoading = () => (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Plantie</p>
          <h1>{t("dashboard.hero")}</h1>
          <p className="hero-copy">{t("household.loadingBody")}</p>
        </div>
        {renderHeroActions()}
      </header>
      <AppTabNav currentPage="plants" onAddPlant={openAddPlantFromMobileNav} t={t} />
      <section className="household-loading-panel" aria-busy="true" aria-live="polite">
        <span className="loading-wheel" aria-hidden="true" />
        <div>
          <h2>{t("household.loading")}</h2>
          <p>{t("household.loadingBody")}</p>
        </div>
      </section>
      {renderHouseholdSheet()}
      <MobileBottomNav currentPage="plants" onAddPlant={openAddPlantFromMobileNav} t={t} />
    </main>
  );

  const updateCareRecord = async (flowerId: string, patch: Partial<FlowerRecords[string]>, message = "") => {
    const supabasePlantId = supabasePlantIdsByLegacyId[flowerId];
    let saved = false;

    if (supabaseWriteMode === "supabase-first" && supabasePlantId) {
      saved = await writeSupabaseFirst(
        () => updateSupabaseCareRecord(supabasePlantId, patch),
        () => updateRecord(flowerId, patch),
      );
      if (!saved) {
        setQuickRecordStatus(t("sync.careWriteFallback"));
      }
    } else if (isSupabaseOnlyDataMode) {
      setSupabaseReadError(true);
      setQuickRecordStatus(t("sync.plantUnavailable"));
    } else {
      updateRecord(flowerId, patch);
      saved = true;
    }

    if (saved && message) {
      setQuickRecordStatus(message);
    }

    if (saved && isUsingSupabaseReadState) {
      const emptyCareRecord = { lastFertilized: "", lastTransplanted: "", lastWatered: "", note: "" };
      setSupabaseReadState((current) =>
        current
          ? {
              ...current,
              records: {
                ...current.records,
                [flowerId]: {
                  ...emptyCareRecord,
                  ...(current.records[flowerId] ?? {}),
                  ...patch,
                },
              },
            }
          : current,
      );
    }

    return saved;
  };

  const saveQuickRecord = async (actionKey: string, flowerId: string, patch: Partial<FlowerRecords[string]>, message: string) => {
    if (pendingQuickRecordKey) {
      return;
    }

    setPendingQuickRecordKey(actionKey);
    try {
      await updateCareRecord(flowerId, patch, message);
    } catch {
      setSupabaseReadError(true);
      setQuickRecordStatus(t("sync.careWriteFallback"));
    } finally {
      setPendingQuickRecordKey("");
    }
  };

  const saveFlower = async (flower: Flower, message = "") => {
    if (supabaseWriteMode === "supabase-first" && supabaseReadState) {
      const result = await writeSupabaseFirst(
        () => upsertSupabasePlantFromFlower(supabaseReadState.household.id, flower),
        () => updateFlower(flower),
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
    if (isCreatingInvite) {
      return;
    }

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

    if (householdInvites.some((invite) => isActiveInvite(invite) && invite.inviteeEmail === normalizedEmail)) {
      setInviteFeedback(t("household.inviteStatusDuplicate"), "error");
      return;
    }

    const feedbackGeneration = transientMessageGenerationRef.current;

    try {
      setIsCreatingInvite(true);
      setInviteFeedback(t("household.inviteStatusCreating"), "info");
      const invite = await createHouseholdInvite(activeSupabaseHouseholdId, normalizedEmail, inviteRole);
      const link = createInviteUrl(invite.token);
      if (isTransientMessageGenerationCurrent(feedbackGeneration)) {
        setCreatedInviteLink(link);
        setInviteEmail("");
        await refreshHouseholdInvites();
      }
      try {
        await sendHouseholdInviteEmail({
          householdId: activeSupabaseHouseholdId,
          householdName: householdDisplayName,
          inviteUrl: link,
          recipientEmail: normalizedEmail,
          role: inviteRole,
        });
        if (isTransientMessageGenerationCurrent(feedbackGeneration)) {
          setInviteFeedback(t("household.inviteStatusSent", { email: normalizedEmail }), "success");
        }
      } catch {
        if (isTransientMessageGenerationCurrent(feedbackGeneration)) {
          setInviteFeedback(t("household.inviteStatusEmailFailed", { email: normalizedEmail }), "error");
        }
      }
    } catch (error) {
      if (isTransientMessageGenerationCurrent(feedbackGeneration)) {
        const debugMessage = safeInviteDebugMessage(error);
        setInviteFeedback(`${t(inviteErrorMessage(error))}${debugMessage ? ` (${debugMessage})` : ""}`, "error");
      }
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const handleCopyInviteLink = async () => {
    if (!createdInviteLink) {
      return;
    }

    const feedbackGeneration = transientMessageGenerationRef.current;

    try {
      await navigator.clipboard.writeText(createdInviteLink);
      if (isTransientMessageGenerationCurrent(feedbackGeneration)) {
        setInviteStatus(t("household.inviteCopied"));
      }
    } catch {
      if (isTransientMessageGenerationCurrent(feedbackGeneration)) {
        setInviteStatus(createdInviteLink);
      }
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (revokeInviteId) {
      return;
    }

    const feedbackGeneration = transientMessageGenerationRef.current;

    try {
      setRevokeInviteId(inviteId);
      await revokeHouseholdInvite(inviteId);
      if (isTransientMessageGenerationCurrent(feedbackGeneration)) {
        setInviteStatus(t("household.inviteRevoked"));
        await refreshHouseholdInvites();
      }
    } catch (error) {
      if (isTransientMessageGenerationCurrent(feedbackGeneration)) {
        setInviteStatus(error instanceof Error ? error.message : t("household.inviteRevokeFailed"));
      }
    } finally {
      setRevokeInviteId("");
    }
  };

  const handleRemoveViewer = async (member: HouseholdMember) => {
    if (removingViewerId) {
      return;
    }

    if (!activeSupabaseHouseholdId || !isCurrentHouseholdOwner || member.role !== "viewer" || member.userId === auth.user?.id) {
      return;
    }

    if (!window.confirm(t("household.removeViewerConfirm", { email: member.email }))) {
      return;
    }

    const feedbackGeneration = transientMessageGenerationRef.current;

    try {
      setRemovingViewerId(member.userId);
      setInviteFeedback(t("household.removeViewerWorking"), "info");
      await removeHouseholdViewer(activeSupabaseHouseholdId, member.userId);
      if (isTransientMessageGenerationCurrent(feedbackGeneration)) {
        setInviteFeedback(t("household.removeViewerSuccess", { email: member.email }), "success");
        const members = await listHouseholdMembers(activeSupabaseHouseholdId);
        setHouseholdMembers(members);
      }
    } catch (error) {
      if (isTransientMessageGenerationCurrent(feedbackGeneration)) {
        const debugMessage = safeInviteDebugMessage(error);
        setInviteFeedback(`${t("household.removeViewerFailed")}${debugMessage ? ` (${debugMessage})` : ""}`, "error");
      }
    } finally {
      setRemovingViewerId("");
    }
  };

  const declinePendingInvite = () => {
    window.localStorage.removeItem(pendingInviteStorageKey);
    setJoinInviteInput("");
    setInviteStatus(t("household.inviteDeclined"));
    window.location.hash = "#/menu";
  };

  const handleAccountSignOut = async () => {
    if (isSigningOut) {
      return;
    }

    if (!window.confirm(t("account.signOutConfirm"))) {
      return;
    }

    try {
      setIsSigningOut(true);
      setAccountActionStatus(t("account.signingOut"));
      await signOut();
      clearHouseholdSession();
      setActiveHousehold(null);
      setSupabaseReadState(null);
      setHouseholdInvites([]);
      setHouseholdMembers([]);
      setIsHouseholdSheetOpen(false);
      setAccountActionStatus("");
      window.location.hash = "#/menu?section=account";
    } catch (error) {
      setAccountActionStatus(error instanceof Error ? error.message : t("account.signOutFailed"));
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleJoinInvite = async (input = joinInviteInput) => {
    if (isJoiningInvite) {
      return false;
    }

    const token = normalizeInviteTokenInput(input);
    if (!token || !isLikelyInviteToken(token)) {
      setInviteStatus(t(token ? "household.inviteStatusInvalidInvite" : "household.inviteStatusMissingToken"));
      return false;
    }

    if (!auth.isAuthenticated) {
      window.localStorage.setItem(pendingInviteStorageKey, token);
      setJoinInviteInput(token);
      setInviteStatus(t("household.inviteStatusAuthRequired"));
      setOnboardingStep("welcome");
      return false;
    }

    const feedbackGeneration = transientMessageGenerationRef.current;

    try {
      setIsJoiningInvite(true);
      setInviteStatus(t("household.joining"));
      const household = await joinHouseholdByInvite(token);
      const session = { name: household.name, publicToken: household.id };
      storeHouseholdSession(session);
      window.localStorage.removeItem(pendingInviteStorageKey);
      setActiveHousehold(session);
      setBaseUrl(currentHouseholdBaseUrl(session.publicToken));
      if (isTransientMessageGenerationCurrent(feedbackGeneration)) {
        setInviteStatus(t("household.joined"));
      }
      window.history.replaceState(null, "", createHouseholdUrl(session.publicToken));
      await refreshSupabaseReadState().catch(() => null);
      return true;
    } catch (error) {
      if (isTransientMessageGenerationCurrent(feedbackGeneration)) {
        setInviteStatus(t(joinInviteErrorMessage(error)));
      }
      return false;
    } finally {
      setIsJoiningInvite(false);
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

    const nameValidation = validateHouseholdName(householdNameDraft);
    if (!nameValidation.valid) {
      setAccessStatus(
        nameValidation.reason === "required"
          ? t("household.renameRequired")
          : nameValidation.reason === "too_long"
            ? t("household.renameTooLong", { count: householdNameMaxLength })
            : t("household.renameUnsafe"),
      );
      return false;
    }

    const feedbackGeneration = transientMessageGenerationRef.current;

    try {
      setIsCreatingHousehold(true);
      setAccessStatus(t("household.creating"));
      let household: HouseholdSession;

      if (auth.isAuthenticated && isSupabaseBackend) {
        const created = await createHousehold(nameValidation.name);
        household = { name: created.name, publicToken: created.id };
      } else if (isLegacyNetlifyBackendEnabled) {
        const response = await fetch("/.netlify/functions/household-access", {
          body: JSON.stringify({ name: nameValidation.name }),
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
      if (isTransientMessageGenerationCurrent(feedbackGeneration)) {
        setAccessStatus(t("household.createFailedRetry"));
      }
      return false;
    } finally {
      if (isTransientMessageGenerationCurrent(feedbackGeneration)) {
        setIsCreatingHousehold(false);
      }
      setIsAccessChecking(false);
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
    if (isAddingPlant) {
      return;
    }

    const plantName = newPlantName.trim();

    if (!plantName || !newPlantImage) {
      setNewPlantStatus(t("plantForm.nameAndImageRequired"));
      return;
    }

    setIsAddingPlant(true);
    setNewPlantStatus(t("image.validatingSafety"));

    try {
      if (activeSupabaseHouseholdId) {
        await assertCanAddPlant(activeSupabaseHouseholdId);
      }
      const imageDataUrl = newPlantImage.dataUrl;
      await validatePlantImageForUpload(imageDataUrl);
      setNewPlantStatus(t("plantForm.generatingCare"));
      const care = await fetchGeneratedCare(plantName, imageDataUrl, {
        generationSource: "initial_plant_add",
        householdId: activeSupabaseHouseholdId,
      });
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
      if (activeSupabaseHouseholdId) {
        const createdPlant = await getHouseholdPlantByLegacyId(activeSupabaseHouseholdId, customFlower.id);
        if (createdPlant) {
          await recordCareTipGeneration(activeSupabaseHouseholdId, createdPlant.id, "initial_plant_add");
        }
        await refreshHouseholdPlanUsage().catch(() => null);
      }
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
    if (isGeneratingCarePreview) {
      return;
    }

    const access = resolveCurrentAiDiagnosisAccess();
    if (!access.allowed) {
      setCarePreviewStatus(aiDiagnosisAccessMessage(access));
      return;
    }

    setIsGeneratingCarePreview(true);
    setCarePreviewStatus(t("detail.aiCarePreparing"));

    try {
      const supabasePlantId = supabasePlantIdsByLegacyId[flower.id];
      if (auth.isAuthenticated && !supabasePlantId) {
        throw new Error("Supabase plant is not available for AI care refresh.");
      }
      const imageDataUrl = await imageSourceToDataUrl(flower.image);
      const nextCare = await fetchGeneratedCare(flower.displayName, imageDataUrl, {
        generationSource: "manual_refresh",
        householdId: activeSupabaseHouseholdId,
        plantId: supabasePlantId,
      });
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
    const access = resolveCurrentAiDiagnosisAccess();
    if (!access.allowed) {
      const message = aiDiagnosisAccessMessage(access);
      setDiagnosisStatus(message);
      if (access.status === "limit_reached") {
        setDiagnosisUpgradeReason(message);
      }
      return;
    }

    setDiagnosisImageDataUrl("");
    setDiagnosisImagePreviewUrl("");
    setDiagnosisDraft(null);
    setDiagnosisSymptomNotes("");
    setDiagnosisUserNote("");
    setDiagnosisStatus("");
    setDiagnosisUpgradeReason("");
    setIsDiagnosisModalOpen(true);
  };

  const closeDiagnosisModal = () => {
    if (isDiagnosing || isCapturingDiagnosisImage) {
      return;
    }

    setIsDiagnosisModalOpen(false);
  };

  const handleNewPlantImageCapture = async (source: "camera" | "gallery", file?: File) => {
    if (isCapturingNewPlantImage || isAddingPlant) {
      return;
    }

    let capturedImage: NormalizedImage | null = null;
    try {
      setIsCapturingNewPlantImage(true);
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
    } finally {
      setIsCapturingNewPlantImage(false);
    }
  };

  const handleDiagnosisImageChange = async (source: "camera" | "gallery", file?: File) => {
    if (isCapturingDiagnosisImage || isDiagnosing) {
      return;
    }

    const access = resolveCurrentAiDiagnosisAccess();
    if (!access.allowed) {
      setDiagnosisStatus(aiDiagnosisAccessMessage(access));
      return;
    }

    if (!file && source === "gallery") {
      return;
    }

    let capturedImage: NormalizedImage | null = null;
    try {
      setIsCapturingDiagnosisImage(true);
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
    } finally {
      setIsCapturingDiagnosisImage(false);
    }
  };

  const runPlantDiagnosis = async (flower: Flower) => {
    if (!diagnosisImageDataUrl || isDiagnosing) {
      return;
    }

    setIsDiagnosing(true);
    setDiagnosisStatus(t("diagnosis.accessChecking"));

    try {
      setDiagnosisStatus(t("image.validatingSafety"));
      await validatePlantImageForUpload(diagnosisImageDataUrl);

      if (auth.isAuthenticated && !activeSupabaseHouseholdId) {
        const message = t("diagnosis.householdRequired");
        setDiagnosisStatus(message);
        return;
      }

      const access = resolveCurrentAiDiagnosisAccess();
      if (!access.allowed) {
        const message = aiDiagnosisAccessMessage(access);
        if (access.status === "limit_reached") {
          setDiagnosisUpgradeReason(message);
        }
        setDiagnosisStatus(message);
        return;
      }

      setDiagnosisStatus(t("diagnosis.aiAnalyzing"));
      const diagnosis = await fetchPlantDiagnosis(
        flower.displayName,
        diagnosisImageDataUrl,
        diagnosisSymptomNotes,
        activeSupabaseHouseholdId,
      );
      setDiagnosisDraft(diagnosis);
      await refreshHouseholdPlanUsage().catch(() => null);
      setDiagnosisStatus(diagnosis.confidence < 45 ? t("diagnosis.lowConfidence") : "");
    } catch (error) {
      setDiagnosisDraft(null);
      setDiagnosisStatus(error instanceof Error ? error.message : t("diagnosis.failed"));
    } finally {
      setIsDiagnosing(false);
    }
  };

  const upsertSupabaseDiagnosisInReadState = (entry: PlantDiagnosticEntry) => {
    setSupabaseReadState((current) =>
      current
        ? {
            ...current,
            diagnostics: [
              entry,
              ...current.diagnostics.filter(
                (diagnostic) =>
                  diagnostic.id !== entry.id &&
                  (!entry.supabaseId || diagnostic.supabaseId !== entry.supabaseId) &&
                  getSupabaseDiagnosticId(diagnostic) !== getSupabaseDiagnosticId(entry),
              ),
            ].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
          }
        : current,
    );
  };

  const savePlantDiagnosis = async (flower: Flower, userConfirmation: DiagnosisConfirmation) => {
    if (!diagnosisDraft || !diagnosisImageDataUrl || !flowerById.has(flower.id)) {
      setDiagnosisStatus(t("diagnosis.saveUnavailable"));
      return;
    }

    if (isSavingDiagnosis) {
      return;
    }

    const now = new Date().toISOString();
    const sanitizedNote = sanitizeDiagnosticNote(diagnosisUserNote);
    const supabasePlantId = supabasePlantIdsByLegacyId[flower.id];
    setIsSavingDiagnosis(true);
    setDiagnosisStatus(t("diagnosis.saving"));

    try {
      if (supabaseWriteMode === "supabase-first") {
        if (!supabasePlantId) {
          setSupabaseReadError(true);
          setDiagnosisStatus(t("diagnosis.saveUnavailable"));
          return;
        }

        const legacyDiagnosisId = createDiagnosticId();
        const saved = await createSupabaseDiagnosis({
          diagnosis: diagnosisDraft,
          imageDataUrl: diagnosisImageDataUrl,
          legacyId: legacyDiagnosisId,
          plantId: supabasePlantId,
          userConfirmation,
          userNote: sanitizedNote,
        });
        const entry: PlantDiagnosticEntry = {
          ...saved,
          id: saved.legacyId ?? legacyDiagnosisId,
          imageDataUrl: saved.imagePath ? "" : diagnosisImageDataUrl,
          imagePath: saved.imagePath ?? undefined,
          plantId: flower.id,
          storageMode: "supabase",
          supabaseId: saved.id,
        };

        upsertSupabaseDiagnosisInReadState(entry);
        setOpenDiagnosticId(entry.id);
        setDiagnosisDraft(null);
        setIsDiagnosisModalOpen(false);
        setDiagnosisStatus(t("diagnosis.saved"));

        try {
          await refreshSupabaseReadState();
        } catch (error) {
          logTechnicalError("Supabase diagnosis history refresh failed after save.", error);
          setDiagnosisStatus(t("diagnosis.savedRefreshFailed"));
        }
        return;
      }

      if (isSupabaseOnlyDataMode) {
        setSupabaseReadError(true);
        setDiagnosisStatus(t("diagnosis.saveFailed"));
        return;
      }

      const entry: PlantDiagnosticEntry = {
        ...diagnosisDraft,
        createdAt: now,
        id: createDiagnosticId(),
        imageDataUrl: diagnosisImageDataUrl,
        plantId: flower.id,
        storageMode: "local",
        updatedAt: now,
        userConfirmation,
        userNote: sanitizedNote,
      };

      setDiagnostics((current) => [entry, ...current.filter((diagnostic) => diagnostic.id !== entry.id)]);
      setOpenDiagnosticId(entry.id);
      setDiagnosisDraft(null);
      setIsDiagnosisModalOpen(false);
      setDiagnosisStatus(t("diagnosis.saved"));
    } catch (error) {
      logTechnicalError("Supabase diagnosis save failed.", error);
      if (isSupabaseOnlyDataMode || supabaseWriteMode === "supabase-first") {
        setSupabaseReadError(true);
      }
      setDiagnosisStatus(t("diagnosis.saveFailed"));
    } finally {
      setIsSavingDiagnosis(false);
    }
  };

  const updateDiagnosticHistoryEntry = async (diagnosticId: string, patch: Partial<Pick<PlantDiagnosticEntry, "userConfirmation" | "userNote">>) => {
    const sanitizedPatch = {
      ...patch,
      ...(patch.userNote !== undefined ? { userNote: sanitizeDiagnosticNote(patch.userNote) } : {}),
    };
    const diagnostic = diagnostics.find((item) => item.id === diagnosticId);

    if (!diagnostic) {
      setDiagnosisStatus(t("diagnosis.saveUnavailable"));
      setDiagnosticHistoryStatus(t("diagnosis.saveUnavailable"));
      return false;
    }

    const applyPatch = (item: PlantDiagnosticEntry): PlantDiagnosticEntry => ({
      ...item,
      ...sanitizedPatch,
      updatedAt: new Date().toISOString(),
    });

    setDiagnostics((current) => current.map((item) => (item.id === diagnosticId ? applyPatch(item) : item)));
    setSupabaseReadState((current) =>
      current
        ? {
            ...current,
            diagnostics: current.diagnostics.map((item) => (item.id === diagnosticId ? applyPatch(item) : item)),
          }
        : current,
    );

    if (diagnostic.storageMode === "supabase" && supabaseWriteMode === "supabase-first") {
      const supabaseDiagnosticId = getSupabaseDiagnosticId(diagnostic);
      if (!supabaseDiagnosticId) {
        setDiagnosisStatus(t("diagnosis.saveUnavailable"));
        setDiagnosticHistoryStatus(t("diagnosis.saveUnavailable"));
        return false;
      }

      try {
        await updateSupabaseDiagnosis(supabaseDiagnosticId, sanitizedPatch);
        await refreshSupabaseReadState();
      } catch (error) {
        logTechnicalError("Supabase diagnosis update failed.", error);
        setDiagnosisStatus(t("diagnosis.updateFailed"));
        setDiagnosticHistoryStatus(t("diagnosis.updateFailed"));
        await refreshSupabaseReadState().catch((refreshError) => {
          logTechnicalError("Supabase diagnosis history refresh failed after update.", refreshError);
        });
        return false;
      }
    }

    return true;
  };

  const updateDiagnosticConfirmation = async (diagnosticId: string, userConfirmation: DiagnosisConfirmation) => {
    if (pendingDiagnosticUpdateKey) {
      return;
    }

    const updateKey = `${diagnosticId}:${userConfirmation}`;
    setPendingDiagnosticUpdateKey(updateKey);
    setDiagnosticHistoryStatus(t("diagnosis.saving"));

    try {
      const saved = await updateDiagnosticHistoryEntry(diagnosticId, { userConfirmation });
      setDiagnosticHistoryStatus(saved ? t("diagnosis.saved") : t("diagnosis.updateFailed"));
    } finally {
      setPendingDiagnosticUpdateKey("");
    }
  };

  const confirmRemoveCustomFlower = async () => {
    if (!deleteFlowerId || isRemovingPlant) {
      return;
    }

    try {
      setIsRemovingPlant(true);
      await removeFlowerById(deleteFlowerId);
      setDeleteFlowerId("");
      window.location.hash = "#/";
    } finally {
      setIsRemovingPlant(false);
    }
  };

  const requestAccountDeletion = async () => {
    if (isRequestingAccountDeletion) {
      return;
    }

    const contact = deleteAccountContact.trim();
    if (!contact) {
      setDeleteAccountStatus("Enter the account email or user ID before requesting deletion review.");
      return;
    }

    try {
      setIsRequestingAccountDeletion(true);
      setDeleteAccountStatus("Submitting deletion review request...");
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
    } finally {
      setIsRequestingAccountDeletion(false);
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
    if (isSupabaseBackend) {
      setHouseholdLookupStatus("checking");
      setIsAccessChecking(true);
    }
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
  const openAddPlantModal = () => {
    setNewPlantStatus("");
    setIsAddPlantModalOpen(true);
  };

  const closeAddPlantModal = () => {
    setNewPlantStatus("");
    setIsAddPlantModalOpen(false);
  };

  const openAddPlantFromMobileNav = () => {
    openAddPlantModal();
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
              <LoadingButton
                className="primary-action"
                type="button"
                onClick={() => void handleJoinInvite()}
                isLoading={isJoiningInvite}
                loadingLabel={t("household.joining")}
              >
                {t("household.acceptInvite")}
              </LoadingButton>
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
          isDeleteRequestPending={isRequestingAccountDeletion}
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

  if ((isSupabaseHouseholdPending || (!shouldUseSupabaseAccountData && isAccessChecking)) && !currentRouteAllowedWithoutHousehold) {
    return renderHouseholdLoading();
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
              <LoadingButton type="submit" isLoading={isCreatingHousehold} loadingLabel={t("household.creatingShort")}>
                <Plus size={18} aria-hidden="true" />
                {t("household.create")}
              </LoadingButton>
            </form>
          )}
          {accessStatus || onboardingStatus ? <p className="access-status">{accessStatus || onboardingStatus}</p> : null}
        </section>
      </main>
    );
  }

  if (!activeHousehold && !supabaseReadState && !currentRouteAllowedWithoutHousehold) {
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
                <LoadingButton className="primary-action" type="submit" isLoading={isCreatingHousehold} loadingLabel={t("household.creatingShort")}>
                  <Plus size={18} aria-hidden="true" />
                  {t("household.create")}
                </LoadingButton>
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
                <LoadingButton
                  className="ghost-action"
                  type="button"
                  onClick={() => void handleJoinInvite()}
                  isLoading={isJoiningInvite}
                  loadingLabel={t("household.joining")}
                >
                  {t("household.continueWithInvite")}
                </LoadingButton>
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
    const diagnosisAccess = resolveCurrentAiDiagnosisAccess();
    const diagnosisBlockedReason = aiDiagnosisAccessMessage(diagnosisAccess);
    const diagnosisUsageLabel =
      currentHouseholdPlanUsage && !currentHouseholdPlanUsage.isPremium
        ? t("diagnosis.usageRemaining", {
            limit: currentHouseholdPlanUsage.aiAnalyzesMonthlyLimit ?? freeAiDiagnosisMonthlyLimit,
            remaining: currentHouseholdPlanUsage.aiAnalyzesRemaining ?? 0,
          })
        : "";
    const diagnosisActionLabel = diagnosisAccess.allowed ? t("detail.diagnosisAction") : aiDiagnosisDisabledActionLabel(diagnosisAccess);
    const diagnosisRunLabel = diagnosisAccess.allowed ? t("diagnosis.run") : aiDiagnosisDisabledActionLabel(diagnosisAccess);
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
              <LoadingButton
                className={`primary-action ${quickRecordStatus === t("detail.savedWatered") ? "quick-action-saved" : ""}`}
                type="button"
                onClick={() => void saveQuickRecord("watered", flower.id, { lastWatered: todayIsoDate() }, t("detail.savedWatered"))}
                isLoading={pendingQuickRecordKey === "watered"}
                disabled={Boolean(pendingQuickRecordKey && pendingQuickRecordKey !== "watered")}
                loadingLabel={t("detail.savingCare")}
            >
              <Droplets size={18} aria-hidden="true" />
              {t("detail.todayWatered")}
            </LoadingButton>
              <LoadingButton
                className={`ghost-action ${quickRecordStatus === t("detail.savedTransplanted") ? "quick-action-saved" : ""}`}
                type="button"
                onClick={() => void saveQuickRecord("transplanted", flower.id, { lastTransplanted: todayIsoDate() }, t("detail.savedTransplanted"))}
                isLoading={pendingQuickRecordKey === "transplanted"}
                disabled={Boolean(pendingQuickRecordKey && pendingQuickRecordKey !== "transplanted")}
                loadingLabel={t("detail.savingCare")}
              >
                <Sprout size={18} aria-hidden="true" />
              {t("detail.todayTransplanted")}
            </LoadingButton>
            <LoadingButton
              className={`ghost-action ${quickRecordStatus === t("detail.savedFertilized") ? "quick-action-saved" : ""}`}
              type="button"
              onClick={() => void saveQuickRecord("fertilized", flower.id, { lastFertilized: todayIsoDate() }, t("detail.savedFertilized"))}
              isLoading={pendingQuickRecordKey === "fertilized"}
              disabled={Boolean(pendingQuickRecordKey && pendingQuickRecordKey !== "fertilized")}
              loadingLabel={t("detail.savingCare")}
            >
              <Leaf size={18} aria-hidden="true" />
              {t("detail.todayFertilized")}
            </LoadingButton>
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
            {diagnosisBlockedReason ? <p className="care-preview-status">{diagnosisBlockedReason}</p> : null}
          </div>
          <button type="button" disabled={!diagnosisAccess.allowed} onClick={openDiagnosisModal}>
            <Camera size={18} aria-hidden="true" />
            {diagnosisActionLabel}
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
            <LoadingButton
              className="ai-care-button"
              type="button"
              disabled={isGeneratingCarePreview || !diagnosisAccess.allowed}
              onClick={() => handleGenerateCarePreview(flower)}
              isLoading={isGeneratingCarePreview}
              loadingLabel={t("detail.generating")}
            >
              <Sparkles size={16} aria-hidden="true" />
              {diagnosisAccess.allowed ? t("detail.generateAi") : aiDiagnosisDisabledActionLabel(diagnosisAccess)}
            </LoadingButton>
          </div>
          {carePreviewStatus ? <p className="care-preview-status">{carePreviewStatus}</p> : diagnosisBlockedReason ? <p className="care-preview-status">{diagnosisBlockedReason}</p> : null}
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
          <label className="field">
            <span>{t("detail.lastWateredDate")}</span>
            <div className="date-row">
              <input
                type="date"
                value={record.lastWatered}
                max="9999-12-31"
                onChange={(event) => void updateCareRecord(flower.id, { lastWatered: event.target.value })}
              />
              <LoadingButton
                type="button"
                onClick={() => void saveQuickRecord("log-watered", flower.id, { lastWatered: todayIsoDate() }, t("detail.savedWatered"))}
                isLoading={pendingQuickRecordKey === "log-watered"}
                disabled={Boolean(pendingQuickRecordKey && pendingQuickRecordKey !== "log-watered")}
                loadingLabel={t("detail.savingCare")}
              >
                {t("date.today")}
              </LoadingButton>
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
              <LoadingButton
                type="button"
                onClick={() => void saveQuickRecord("log-transplanted", flower.id, { lastTransplanted: todayIsoDate() }, t("detail.savedTransplanted"))}
                isLoading={pendingQuickRecordKey === "log-transplanted"}
                disabled={Boolean(pendingQuickRecordKey && pendingQuickRecordKey !== "log-transplanted")}
                loadingLabel={t("detail.savingCare")}
              >
                {t("date.today")}
              </LoadingButton>
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
              <LoadingButton
                type="button"
                onClick={() => void saveQuickRecord("log-fertilized", flower.id, { lastFertilized: todayIsoDate() }, t("detail.savedFertilized"))}
                isLoading={pendingQuickRecordKey === "log-fertilized"}
                disabled={Boolean(pendingQuickRecordKey && pendingQuickRecordKey !== "log-fertilized")}
                loadingLabel={t("detail.savingCare")}
              >
                {t("date.today")}
              </LoadingButton>
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

        <section className="diagnostic-history-panel" id="diagnostic-history-panel" tabIndex={-1} aria-labelledby="diagnostic-history-title">
          <div className="section-title">
            <Camera size={18} aria-hidden="true" />
            <h2 id="diagnostic-history-title">{t("diagnosis.history")}</h2>
          </div>
          {flowerDiagnostics.length === 0 ? (
            <p>{t("diagnosis.historyEmpty")}</p>
          ) : (
            <>
              {diagnosticHistoryStatus ? <p className="care-preview-status diagnostic-history-status" aria-live="polite">{diagnosticHistoryStatus}</p> : null}
              <div className="diagnostic-history-list">
              {flowerDiagnostics.map((diagnosis) => {
                const isOpen = openDiagnosticId === diagnosis.id;
                const confirmUpdateKey = `${diagnosis.id}:confirmed`;
                const rejectUpdateKey = `${diagnosis.id}:rejected`;
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
                            <LoadingButton
                              className="primary-action"
                              type="button"
                              onClick={() => void updateDiagnosticConfirmation(diagnosis.id, "confirmed")}
                              isLoading={pendingDiagnosticUpdateKey === confirmUpdateKey}
                              disabled={Boolean(pendingDiagnosticUpdateKey && pendingDiagnosticUpdateKey !== confirmUpdateKey)}
                              loadingLabel={t("diagnosis.saving")}
                            >
                              {t("diagnosis.confirm")}
                            </LoadingButton>
                            <LoadingButton
                              className="neutral-action"
                              type="button"
                              onClick={() => void updateDiagnosticConfirmation(diagnosis.id, "rejected")}
                              isLoading={pendingDiagnosticUpdateKey === rejectUpdateKey}
                              disabled={Boolean(pendingDiagnosticUpdateKey && pendingDiagnosticUpdateKey !== rejectUpdateKey)}
                              loadingLabel={t("diagnosis.saving")}
                            >
                              {t("diagnosis.reject")}
                            </LoadingButton>
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
            </>
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
              {diagnosisUsageLabel ? <p className="care-preview-status">{diagnosisUsageLabel}</p> : null}
              {diagnosisBlockedReason ? <p className="care-preview-status">{diagnosisBlockedReason}</p> : null}

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

              <label
                className={`diagnosis-upload ${diagnosisAccess.allowed && !isCapturingDiagnosisImage && !isDiagnosing ? "" : "diagnosis-upload-disabled"}`}
                aria-disabled={!diagnosisAccess.allowed || isCapturingDiagnosisImage || isDiagnosing}
              >
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
                  disabled={!diagnosisAccess.allowed || isCapturingDiagnosisImage || isDiagnosing}
                  onChange={(event) => {
                    void handleDiagnosisImageChange("gallery", event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>

              {isNativeImageRuntime ? (
                <div className="image-capture-actions">
                  <LoadingButton
                    className="ghost-action"
                    type="button"
                    disabled={!diagnosisAccess.allowed}
                    onClick={() => void handleDiagnosisImageChange("camera")}
                    isLoading={isCapturingDiagnosisImage}
                    loadingLabel={t("image.processing")}
                  >
                    <Camera size={17} aria-hidden="true" />
                    {t("action.camera")}
                  </LoadingButton>
                  <LoadingButton
                    className="ghost-action"
                    type="button"
                    disabled={!diagnosisAccess.allowed}
                    onClick={() => void handleDiagnosisImageChange("gallery")}
                    isLoading={isCapturingDiagnosisImage}
                    loadingLabel={t("image.processing")}
                  >
                    <ImagePlus size={17} aria-hidden="true" />
                    {t("action.gallery")}
                  </LoadingButton>
                </div>
              ) : null}

              {diagnosisImageDataUrl ? <img className="diagnosis-preview" src={diagnosisImagePreviewUrl || diagnosisImageDataUrl} alt={t("diagnosis.previewAlt")} /> : null}
              {diagnosisStatus ? <p className="care-preview-status">{diagnosisStatus}</p> : null}

              <LoadingButton
                className="primary-action diagnosis-run-button"
                type="button"
                disabled={!diagnosisImageDataUrl || isDiagnosing || !diagnosisAccess.allowed}
                onClick={() => runPlantDiagnosis(flower)}
                isLoading={isDiagnosing}
                loadingLabel={t("diagnosis.analyzing")}
              >
                {diagnosisRunLabel}
              </LoadingButton>

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
                    <LoadingButton
                      className="primary-action"
                      type="button"
                      isLoading={isSavingDiagnosis}
                      loadingLabel={t("diagnosis.saving")}
                      onClick={() => savePlantDiagnosis(flower, "confirmed")}
                    >
                      {t("diagnosis.save")}
                    </LoadingButton>
                    <LoadingButton
                      className="neutral-action"
                      type="button"
                      isLoading={isSavingDiagnosis}
                      loadingLabel={t("diagnosis.saving")}
                      onClick={() => savePlantDiagnosis(flower, "rejected")}
                    >
                      {t("diagnosis.reject")}
                    </LoadingButton>
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
                <LoadingButton
                  className="danger-action"
                  type="button"
                  onClick={() => void confirmRemoveCustomFlower()}
                  isLoading={isRemovingPlant}
                  loadingLabel={t("detail.deletingPlant")}
                >
                  {t("detail.deleteConfirmAction")}
                </LoadingButton>
                <button className="neutral-action" type="button" disabled={isRemovingPlant} onClick={() => setDeleteFlowerId("")}>
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
                <LoadingButton
                  className="primary-action"
                  type="button"
                  onClick={() => void handleJoinInvite()}
                  isLoading={isJoiningInvite}
                  loadingLabel={t("household.joining")}
                >
                  {t("household.continueWithInvite")}
                </LoadingButton>
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
                    <strong>{accountSubscriptionLabel}</strong>
                  </div>
                </div>
                <div className="menu-action-row">
                  <LoadingButton
                    className="neutral-action"
                    type="button"
                    onClick={() => void handleAccountSignOut()}
                    isLoading={isSigningOut}
                    loadingLabel={t("account.signingOut")}
                  >
                    {t("account.signOut")}
                  </LoadingButton>
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
              <div className="account-summary-list household-menu-summary">
                <div className="household-menu-identity-card">
                  <span>{t("account.household")}</span>
                  {activeHousehold || supabaseReadState ? (
                    <>
                      {renderHouseholdNameEditor("menu")}
                      {householdNameEditStatus && householdNameEditSurface !== "menu" ? (
                        <p className={householdNameEditStatusClass}>{householdNameEditStatus}</p>
                      ) : null}
                    </>
                  ) : (
                    <strong>{t("account.householdRequired")}</strong>
                  )}
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
              {auth.isAuthenticated && (activeHousehold || supabaseReadState) ? (
                <div className="menu-action-row">
                  <button className="neutral-action" type="button" onClick={changeHousehold}>
                    <UsersRound size={17} aria-hidden="true" />
                    {t("household.createOrJoin")}
                  </button>
                </div>
              ) : null}
              {householdMembers.length > 0 ? (
                <section className="household-member-management" aria-labelledby="household-members-title">
                  <div className="household-member-management-head">
                    <span className="household-member-management-icon" aria-hidden="true">
                      <UsersRound size={18} />
                    </span>
                    <div>
                      <h2 id="household-members-title">{t("household.members")}</h2>
                      <p>{t("household.memberCount", { count: householdMembers.length })}</p>
                    </div>
                  </div>
                  <div className="household-member-list" aria-label={t("household.members")}>
                    {householdMembers.map((member) => (
                      <div key={member.userId}>
                        <span className="household-member-identity">
                          <strong>{member.email}</strong>
                          <span className="household-member-role">{householdRoleLabel(member.role)}</span>
                        </span>
                        {isCurrentHouseholdOwner && member.role === "viewer" && member.userId !== auth.user?.id ? (
                          <LoadingButton
                            className="household-member-remove-action"
                            type="button"
                            onClick={() => void handleRemoveViewer(member)}
                            isLoading={removingViewerId === member.userId}
                            disabled={Boolean(removingViewerId && removingViewerId !== member.userId)}
                            loadingLabel={t("household.removeViewerWorking")}
                          >
                            {t("household.removeViewer")}
                          </LoadingButton>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
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
                    <LoadingButton
                      className="primary-action"
                      type="button"
                      onClick={() => void handleCreateInvite()}
                      isLoading={isCreatingInvite}
                      loadingLabel={t("household.inviteStatusCreating")}
                    >
                      {t("household.createEmailInvite")}
                    </LoadingButton>
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
                                : t("household.inviteStatusPending")}
                            {" - "}
                            {householdRoleLabel(invite.role)}
                          </span>
                          {!invite.revokedAt && !invite.usedAt ? (
                            <LoadingButton
                              type="button"
                              onClick={() => void handleRevokeInvite(invite.id)}
                              isLoading={revokeInviteId === invite.id}
                              disabled={Boolean(revokeInviteId && revokeInviteId !== invite.id)}
                              loadingLabel={t("household.inviteRevoking")}
                            >
                              {t("household.revokeInvite")}
                            </LoadingButton>
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
                    <LoadingButton className="primary-action" type="submit" isLoading={isCreatingHousehold} loadingLabel={t("household.creatingShort")}>
                      {t("household.create")}
                    </LoadingButton>
                  </form>
                  <label className="field">
                    <span>{t("household.inviteToken")}</span>
                    <input
                      value={joinInviteInput}
                      onChange={(event) => setJoinInviteInput(event.target.value)}
                      placeholder="#/join?invite=..."
                    />
                  </label>
                  <LoadingButton
                    className="neutral-action"
                    type="button"
                    onClick={() => void handleJoinInvite()}
                    isLoading={isJoiningInvite}
                    loadingLabel={t("household.joining")}
                  >
                    {t("household.join")}
                  </LoadingButton>
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
              <PricingPage householdPlanUsage={currentHouseholdPlanUsage} language={selectedLanguage} />
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
                <a className="diagnose-picker-card" href={flowerPath(flower.id, false, "diagnostics")} key={flower.id}>
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
            <LoadingButton
              className="icon-button"
              type="button"
              onClick={handleQrPdfExport}
              aria-label={t("qr.exportPdf")}
              isLoading={isExportingQrPdf}
              loadingLabel={<span className="sr-only">{t("qr.exportGenerating")}</span>}
            >
              <FileDown size={21} aria-hidden="true" />
            </LoadingButton>
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
                <LoadingButton type="button" onClick={handleQrPdfExport} isLoading={isExportingQrPdf} loadingLabel={t("qr.exportGenerating")}>
                  <FileDown size={18} aria-hidden="true" />
                  {t("qr.exportPdf")}
                </LoadingButton>
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
            <button className="modal-close" type="button" onClick={closeAddPlantModal} aria-label={t("action.close")}>
              <X size={20} aria-hidden="true" />
            </button>
            <div className="section-title">
              <Plus size={18} aria-hidden="true" />
              <h2 id="add-plant-title">{t("plantForm.title")}</h2>
            </div>
            <p>{t("plantForm.body")}</p>
            {plantLimitLabel ? <p className="care-preview-status">{plantLimitLabel}</p> : null}
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
                    disabled={isCapturingNewPlantImage || isAddingPlant}
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
                    <LoadingButton
                      className="ghost-action"
                      type="button"
                      onClick={() => void handleNewPlantImageCapture("camera")}
                      isLoading={isCapturingNewPlantImage}
                      disabled={isAddingPlant}
                      loadingLabel={t("image.processing")}
                    >
                      <Camera size={17} aria-hidden="true" />
                      {t("action.camera")}
                    </LoadingButton>
                    <LoadingButton
                      className="ghost-action"
                      type="button"
                      onClick={() => void handleNewPlantImageCapture("gallery")}
                      isLoading={isCapturingNewPlantImage}
                      disabled={isAddingPlant}
                      loadingLabel={t("image.processing")}
                    >
                      <ImagePlus size={17} aria-hidden="true" />
                      {t("action.gallery")}
                    </LoadingButton>
                  </div>
                ) : null}
                {newPlantImage ? <img className="diagnosis-preview" src={newPlantImage.previewUrl} alt={t("plantForm.previewAlt")} /> : null}
              </label>
              <LoadingButton type="submit" disabled={plantLimitReached || isCapturingNewPlantImage} isLoading={isAddingPlant} loadingLabel={t("plantForm.adding")}>
                <Plus size={18} aria-hidden="true" />
                {t("dashboard.addPlant")}
              </LoadingButton>
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
            <button className="primary-action" type="button" onClick={openAddPlantModal}>
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
                      void updateCareRecord(flower.id, { lastWatered: todayIsoDate() }, t("detail.savedWatered"));
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
