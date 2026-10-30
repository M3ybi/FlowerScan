import {
  ArrowLeft,
  Home,
  KeyRound,
  Leaf,
  Plus,
  Sprout,
  UserRound
} from "lucide-react";
import type { MouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  currentBaseUrl,
  currentHouseholdBaseUrl,
  formatLocalizedDate,
  formatLocalizedElapsedDays,
  formatLocalizedWateringStatus,
  pageTitle
} from "./app/appFormatting";
import { AppRouter } from "./app/AppRouter";
import type { CarePreview } from "./app/carePresentation";
import {
  createSingleFlightInviteJoin,
  normalizeInviteTokenInput
} from "./app/householdInvites";
import { buildHouseholdPeople } from "./app/householdPeople";
import {
  diagnosticsStorageKey,
  readStoredDiagnostics
} from "./app/localDiagnostics";
import { areStringRecordsEqual, mergeCloudRecords } from "./app/records";
import { isRouteAllowedWithoutHousehold, useHashRoute } from "./app/routes";
import { AppTabNav, MobileBottomNav } from "./components/AppNavigation";
import { AuthMessage, AuthPanel } from "./components/AuthPanel";
import { HouseholdInvitationInbox, InvitationInboxButton } from "./components/HouseholdInvitationInbox";
import { HouseholdInvitationReview } from "./components/HouseholdInvitationReview";
import { InvitationCenterOverlay } from "./components/InvitationCenterOverlay";
import { LoadingButton } from "./components/LoadingButton";
import { HealthPage, LegalPageView, ReleaseChecklistPage } from "./components/ReleasePages";
import type { Flower } from "./data/flowers";
import { flowers as builtInFlowers } from "./data/flowers";
import { useRecoveryActions } from "./features/auth/hooks/useRecoveryActions";
import { useCareActions } from "./features/care/hooks/useCareActions";
import { useDiagnosisActions } from "./features/diagnosis/hooks/useDiagnosisActions";
import { HouseholdSheet } from "./features/households/components/HouseholdSheet";
import { useHouseholdCreation } from "./features/households/hooks/useHouseholdCreation";
import { useHouseholdManagement } from "./features/households/hooks/useHouseholdManagement";
import { useHouseholdSelectionActions } from "./features/households/hooks/useHouseholdSelectionActions";
import type { HouseholdLookupStatus, HouseholdNameEditSurface } from "./features/households/types";
import { useInvitationActions } from "./features/invitations/hooks/useInvitationActions";
import { useInvitationReviewActions } from "./features/invitations/hooks/useInvitationReviewActions";
import { usePlantActions } from "./features/plants/hooks/usePlantActions";
import { usePlantPersistence } from "./features/plants/hooks/usePlantPersistence";
import { useAccountDeletion } from "./features/settings/hooks/useAccountDeletion";
import { useAuth } from "./hooks/useAuth";
import { useCustomFlowers } from "./hooks/useCustomFlowers";
import type { FlowerRecords } from "./hooks/useFlowerRecords";
import { useFlowerRecords } from "./hooks/useFlowerRecords";
import { useHouseholdDirectory } from "./hooks/useHouseholdDirectory";
import { useHouseholdInvitation, useHouseholdInvitations } from "./hooks/useHouseholdInvitations";
import { useImageSelection } from "./hooks/useImageSelection";
import { useSubscriptionState } from "./hooks/useSubscriptionState";
import type { AiDiagnosisAccessResult } from "./lib/aiDiagnosisAccess";
import { resolveAiDiagnosisAccess } from "./lib/aiDiagnosisAccess";
import { authPanelCopy, authPanelNoticeContent } from "./lib/authPanelCopy";
import { signOut } from "./lib/authService";
import { isLegacyNetlifyBackendEnabled, isSupabaseBackend } from "./lib/backendConfig";
import { browserStorage } from "./lib/browserStorage.js";
import { normalizeDiagnosisConfidenceLevel } from "./lib/diagnosisConfidence";
import { safeFailureMetadata } from "./lib/errorDiagnostics";
import { householdInvitationCopy } from "./lib/householdInvitationCopy";
import { canInviteHouseholdMember, usedHouseholdSlots as countUsedHouseholdSlots } from "./lib/householdMembershipRules";
import { isCurrentHouseholdOperationScope } from "./lib/householdOperationScope";
import { resolveHouseholdPermissions } from "./lib/householdPermissions";
import { freeQrLabelLimit, PLAN_LIMITS } from "./lib/householdPlanRules";
import { readSelectedHouseholdId, resolveHouseholdSelection, writeSelectedHouseholdId } from "./lib/householdSelection";
import { householdSubscriptionCopy } from "./lib/householdSubscriptionCopy";
import { createTranslator, translate } from "./lib/i18n";
import type { OnboardingStep, PlantieLanguage } from "./lib/onboarding";
import {
  getInitialOnboardingStep,
  hasCompletedOnboarding,
  markOnboardingComplete,
  readStoredLanguage,
  supportedLanguages,
  writeStoredLanguage,
} from "./lib/onboarding";
import type { Household, HouseholdInvitation, HouseholdInvite, HouseholdMember } from "./lib/plantieRepository";
import { isSupabaseConfigured } from "./lib/supabase";
import type { SupabaseReadThroughState } from "./lib/supabaseReadThrough";
import {
  detectDataSourceMode,
  invalidateSupabaseReadThroughCache,
  loadSupabaseReadThroughState,
} from "./lib/supabaseReadThrough";
import {
  detectSupabaseWriteMode,
  runRequiredSupabaseWrite,
  runSupabaseWrite
} from "./lib/supabaseSourceOfTruth";
import type { PlantDiagnosisDraft, PlantDiagnosticEntry } from "./utils/diagnostics";
import {
  sanitizeDiagnosticEntries
} from "./utils/diagnostics";
import type { HouseholdSession } from "./utils/household";
import {
  clearHouseholdSession,
  createHouseholdApiUrl,
  getHouseholdTokenFromUrl,
  getStoredHouseholdSession,
  isValidHouseholdToken,
  removeHouseholdFromCurrentUrl,
  storeHouseholdSession
} from "./utils/household";
import { createQrLabelLayout, exportQrLabelsPdf, validateQrLabelLayout } from "./utils/qrPdf";
import { getWateringProgress } from "./utils/watering";

const isSupabaseReadThroughEnabled = isSupabaseConfigured && import.meta.env.VITE_DISABLE_SUPABASE_READS !== "true";
const isSupabaseWriteThroughEnvEnabled =
  isSupabaseReadThroughEnabled &&
  import.meta.env.VITE_DISABLE_SUPABASE_WRITES !== "true" &&
  import.meta.env.VITE_ENABLE_SUPABASE_WRITES !== "false";
const isSupabaseOnlyDataMode = isSupabaseReadThroughEnabled && isSupabaseBackend;
const supabaseWritesDisabledStorageKey = "plantie-disable-supabase-writes-v1";
const pendingInviteStorageKey = "plantie-pending-household-invite-v1";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value: string) => uuidPattern.test(value);

const getSupabaseDiagnosticId = (diagnostic: PlantDiagnosticEntry) =>
  diagnostic.supabaseId ?? (isUuid(diagnostic.id) ? diagnostic.id : "");

const logTechnicalError = (message: string, error: unknown) => {
  console.error(message, safeFailureMetadata(error));
};

export const App = () => {
  const auth = useAuth();
  const route = useHashRoute(auth);
  const { authEntry, setAuthEntry, isLeavingRecovery, recoveryExitFailed, completeRecovery, requestNewRecoveryLink } = useRecoveryActions(auth);
  const householdDirectory = useHouseholdDirectory(auth.user?.id ?? null);
  const invitationInbox = useHouseholdInvitations(auth.user);
  const invitationMailboxRef = useRef<HTMLButtonElement>(null);
  const [selectedInboxInvitationId, setSelectedInboxInvitationId] = useState<string | null>(null);
  const inboxInvitationReview = useHouseholdInvitation({ invitationId: selectedInboxInvitationId ?? undefined, user: auth.user });
  const invitationReview = useHouseholdInvitation({
    token: route.page === "join" ? route.invite : undefined,
    invitationId: route.page === "join" ? route.invitationId : undefined,
    user: auth.user,
  });
  const householdDataGenerationRef = useRef(0);
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
  const [activeHousehold, setActiveHousehold] = useState<HouseholdSession | null>(() =>
    isSupabaseBackend ? null : getStoredHouseholdSession(),
  );
  const householdOperationScope = {
    userId: auth.user?.id ?? null,
    householdToken: activeHousehold?.publicToken ?? null,
    generation: householdDataGenerationRef.current,
  };
  const householdOperationScopeRef = useRef(householdOperationScope);
  householdOperationScopeRef.current = householdOperationScope;
  const isHouseholdOperationCurrent = (started = householdOperationScope) =>
    isCurrentHouseholdOperationScope(started, householdOperationScopeRef.current, householdDataGenerationRef.current);
  const routeLifecycleKey =
    route.page === "detail"
      ? `detail:${route.flowerId}:${route.scan ? "scan" : "view"}:${route.panel}`
      : route.page === "menu"
        ? `menu:${route.section}`
        : route.page === "join"
          ? `join:${route.invite}:${route.invitationId ?? ""}`
          : route.page === "legal"
            ? `legal:${route.legalPageId}`
            : route.page;
  const invitationRouteKey = selectedInboxInvitationId
    ? `inbox:${routeLifecycleKey}:${selectedInboxInvitationId}`
    : route.page === "join" ? `route:${route.invite}:${route.invitationId ?? ""}` : "";
  const invitationRouteKeyRef = useRef(invitationRouteKey);
  invitationRouteKeyRef.current = invitationRouteKey;
  const [selectedLanguage, setSelectedLanguage] = useState<PlantieLanguage | null>(() => readStoredLanguage(browserStorage));
  const t = useMemo(() => createTranslator(selectedLanguage), [selectedLanguage]);
  const subscriptionCopy = householdSubscriptionCopy(selectedLanguage);
  const invitationCopy = householdInvitationCopy(selectedLanguage);
  const localizedConfidenceLabel = (value: string) => {
    const level = normalizeDiagnosisConfidenceLevel(value);
    return level ? t(`diagnosis.confidenceLevel.${level}`) : value;
  };
  const formatAppDate = (value: string) => formatLocalizedDate(value, selectedLanguage, t);
  const formatAppElapsedDays = (value: number | null) => formatLocalizedElapsedDays(value, t);
  const formatAppWateringStatus = (progress: ReturnType<typeof getWateringProgress>) => formatLocalizedWateringStatus(progress, t);
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>(() =>
    getInitialOnboardingStep({
      hasCompleted: hasCompletedOnboarding(browserStorage),
      hasExistingHousehold: Boolean(getStoredHouseholdSession() || getHouseholdTokenFromUrl()),
      hasLanguage: Boolean(readStoredLanguage(browserStorage)),
      hasMigratedSupabaseHousehold: false,
    }),
  );
  const [onboardingStatus, setOnboardingStatus] = useState("");
  const [isNewOnboardingHousehold, setIsNewOnboardingHousehold] = useState(false);
  const [accessStatus, setAccessStatus] = useState("");
  const [householdNameDraft, setHouseholdNameDraft] = useState(() => translate(readStoredLanguage(browserStorage), "household.defaultName"));
  const [householdNameEditDraft, setHouseholdNameEditDraft] = useState("");
  const [householdNameEditSurface, setHouseholdNameEditSurface] = useState<HouseholdNameEditSurface | null>(null);
  const [householdNameEditStatus, setHouseholdNameEditStatus] = useState("");
  const [householdNameEditStatusTone, setHouseholdNameEditStatusTone] = useState<"error" | "info" | "success">("info");
  const [isSavingHouseholdName, setIsSavingHouseholdName] = useState(false);
  const [isHouseholdSheetOpen, setIsHouseholdSheetOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [isInvitePanelOpen, setIsInvitePanelOpen] = useState(false);
  const [inviteStatus, setInviteStatus] = useState("");
  const [inviteStatusTone, setInviteStatusTone] = useState<"error" | "info" | "success">("info");
  const inviteStatusClass = inviteStatus ? `report-status invite-status invite-status-${inviteStatusTone}` : "";
  const [sendingInviteId, setSendingInviteId] = useState<string | null>(null);
  const [householdInvites, setHouseholdInvites] = useState<HouseholdInvite[]>([]);
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMember[]>([]);
  const [householdPeopleLoading, setHouseholdPeopleLoading] = useState(false);
  const [householdPeopleError, setHouseholdPeopleError] = useState("");
  const [removingPersonKeys, setRemovingPersonKeys] = useState<Set<string>>(() => new Set());
  const removingPersonKeysRef = useRef(new Set<string>());
  const householdPeopleRequestRef = useRef(0);
  const householdPeopleScopeRef = useRef("");
  const [joinInviteInput, setJoinInviteInput] = useState("");
  const [isJoiningInvite, setIsJoiningInvite] = useState(false);
  const joinInviteOnceRef = useRef(createSingleFlightInviteJoin());
  const [isInvitationInboxOpen, setIsInvitationInboxOpen] = useState(false);
  const [acceptedInvitationHousehold, setAcceptedInvitationHousehold] = useState<Household | null>(null);
  const [invitationActionError, setInvitationActionError] = useState("");
  const [acceptedInboxInvitationHousehold, setAcceptedInboxInvitationHousehold] = useState<Household | null>(null);
  const [inboxInvitationActionError, setInboxInvitationActionError] = useState("");
  const [isDecliningInvitation, setIsDecliningInvitation] = useState(false);
  const decliningInvitationRef = useRef(false);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const signingOutRef = useRef(false);
  const [isAccessChecking, setIsAccessChecking] = useState(true);
  const [householdLookupStatus, setHouseholdLookupStatus] = useState<HouseholdLookupStatus>("idle");
  const [isCreatingHousehold, setIsCreatingHousehold] = useState(false);
  const [, setReportRecipient] = useState(() => browserStorage.getItem("flowscan-report-recipient-v1") ?? "");
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(false);
  const [cloudSyncReady, setCloudSyncReady] = useState(false);
  const [qrExportStatus, setQrExportStatus] = useState("");
  const [isExportingQrPdf, setIsExportingQrPdf] = useState(false);
  const qrPdfExportRef = useRef<symbol | null>(null);
  const [newPlantName, setNewPlantName] = useState("");
  const [newPlantStatus, setNewPlantStatus] = useState("");
  const [isAddingPlant, setIsAddingPlant] = useState(false);
  const plantSubmissionRef = useRef<symbol | null>(null);
  const pendingPlantIdRef = useRef<string | null>(null);
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
  const [diagnosisDraft, setDiagnosisDraft] = useState<PlantDiagnosisDraft | null>(null);
  const [diagnosisUserNote, setDiagnosisUserNote] = useState("");
  const [diagnosisStatus, setDiagnosisStatus] = useState("");
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [isSavingDiagnosis, setIsSavingDiagnosis] = useState(false);
  const [diagnosisSymptomNotes, setDiagnosisSymptomNotes] = useState("");
  const [diagnosisUpgradeReason, setDiagnosisUpgradeReason] = useState("");
  const imageSelectionScope = `${householdOperationScope.userId}:${householdOperationScope.householdToken}:${householdOperationScope.generation}`;
  const newImageSelection = useImageSelection({
    enabled: isAddPlantModalOpen && route.page === "dashboard" && !isAddingPlant, scopeKey: imageSelectionScope, language: selectedLanguage,
    onStatus: setNewPlantStatus, copy: { processing: t("image.processing"), validating: t("image.validatingPlant"), ready: t("image.ready") },
  });
  const diagnosisImageSelection = useImageSelection({
    enabled: isDiagnosisModalOpen && route.page === "detail" && !isDiagnosing, scopeKey: `${imageSelectionScope}:${route.page === "detail" ? route.flowerId : ""}`, language: selectedLanguage,
    onStatus: setDiagnosisStatus, onReady: () => setDiagnosisDraft(null),
    copy: { processing: t("image.processing"), validating: t("image.validatingPlant"), ready: t("diagnosis.imageReady") },
  });
  const newPlantImage = newImageSelection.image;
  const diagnosisImageDataUrl = diagnosisImageSelection.image?.dataUrl ?? "";
  const diagnosisImagePreviewUrl = diagnosisImageSelection.image?.previewUrl ?? "";
  const isCapturingDiagnosisImage = diagnosisImageSelection.isProcessing;
  const [openDiagnosticId, setOpenDiagnosticId] = useState("");
  const [diagnosticHistoryStatus, setDiagnosticHistoryStatus] = useState("");
  const [pendingDiagnosticUpdateKey, setPendingDiagnosticUpdateKey] = useState("");
  const { deleteAccountStatus, setDeleteAccountStatus, isRequestingAccountDeletion, requestAccountDeletion } = useAccountDeletion(auth.user?.id ?? null, selectedLanguage, t("account.deleteConfirm"));
  const [accountActionStatus, setAccountActionStatus] = useState("");
  const [healthEndpointStatus, setHealthEndpointStatus] = useState("");
  const [supabasePlantIdsByLegacyId, setSupabasePlantIdsByLegacyId] = useState<Record<string, string>>({});
  const [quickRecordStatus, setQuickRecordStatus] = useState("");
  const [pendingQuickRecordKey, setPendingQuickRecordKey] = useState("");
  const [supabaseReadState, setSupabaseReadState] = useState<SupabaseReadThroughState | null>(null);
  const [supabaseReadError, setSupabaseReadError] = useState(false);
  const previousAuthUserIdRef = useRef<string | null>(null);
  const isSupabaseAuthIdentityTransition =
    isSupabaseBackend && !auth.loading && previousAuthUserIdRef.current !== (auth.user?.id ?? null);
  const transientMessageGenerationRef = useRef(0);
  const [isSupabaseWritesLocallyDisabled] = useState(
    () => browserStorage.getItem(supabaseWritesDisabledStorageKey) === "true",
  );
  const isSupabaseWriteThroughEnabled = isSupabaseWriteThroughEnvEnabled && !isSupabaseWritesLocallyDisabled;
  const shouldUseSupabaseAccountData = isSupabaseReadThroughEnabled && isSupabaseBackend && (auth.loading || auth.isAuthenticated);
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
  const { subscription, refreshSubscriptionState } = useSubscriptionState(
    auth.user?.id ?? null,
    isSupabaseAuthIdentityTransition ? null : activeSupabaseHouseholdId || null,
  );
  const currentHouseholdPlanUsage = subscription.householdPlanUsage;
  const plantLimitReached = currentHouseholdPlanUsage?.plantsRemaining === 0;
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
  const householdPermissions = resolveHouseholdPermissions(
    currentHouseholdMember?.role ?? null,
    currentHouseholdMember?.status ?? "active",
  );
  const householdEntitlement = subscription.householdEntitlement;
  const usedHouseholdSlots = householdEntitlement ? countUsedHouseholdSlots(householdEntitlement) : 0;
  const canInviteToHousehold = subscription.status === "ready" && canInviteHouseholdMember(householdEntitlement);
  const householdPeople = useMemo(
    () => buildHouseholdPeople(activeSupabaseHouseholdId ?? "", householdMembers, householdInvites),
    [activeSupabaseHouseholdId, householdMembers, householdInvites],
  );
  householdPeopleScopeRef.current = activeSupabaseHouseholdId ?? "";
  const canRenameHousehold = auth.isAuthenticated && Boolean(activeSupabaseHouseholdId) && householdPermissions.canEditHousehold;
  const householdNameEditStatusClass = householdNameEditStatus
    ? `household-name-edit-status household-name-edit-status-${householdNameEditStatusTone}`
    : "";
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
  const householdLifecycleKey = activeSupabaseHouseholdId || activeHousehold?.publicToken || "";

  const resetHouseholdOperations = () => {
    setIsAddingPlant(false);
    plantSubmissionRef.current = null;
    pendingPlantIdRef.current = null;
    newImageSelection.clear();
    diagnosisImageSelection.clear();
    setIsGeneratingCarePreview(false);
    setIsDiagnosing(false);
    setIsSavingDiagnosis(false);
    setIsRemovingPlant(false);
    setIsCreatingInvite(false);
    setIsExportingQrPdf(false);
    qrPdfExportRef.current = null;
    setPendingQuickRecordKey("");
    setPendingDiagnosticUpdateKey("");
    setNewPlantName("");
    setDiagnosisDraft(null);
    setIsAddPlantModalOpen(false);
    setIsDiagnosisModalOpen(false);
    removingPersonKeysRef.current.clear();
    setRemovingPersonKeys(new Set());
  };

  const clearTransientMessages = () => {
    transientMessageGenerationRef.current += 1;
    setAccessStatus("");
    setAccountActionStatus("");
    setCarePreviewStatus("");
    setSendingInviteId(null);
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
    setIsInvitePanelOpen(false);
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

  useEffect(() => {
    if (route.page !== "menu" || (!inviteStatus && !householdNameEditStatus)) return;
    const timeout = window.setTimeout(() => {
      setInviteStatus("");
      setHouseholdNameEditStatus("");
    }, 6_000);
    return () => window.clearTimeout(timeout);
  }, [route.page, inviteStatus, householdNameEditStatus]);

  const isTransientMessageGenerationCurrent = (generation: number) =>
    generation === transientMessageGenerationRef.current;

  useEffect(() => {
    if (route.page === "detail" && route.panel === "diagnostics") {
      return;
    }

    window.scrollTo({ top: 0, left: 0 });
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
    browserStorage.setItem(diagnosticsStorageKey, JSON.stringify(legacyDiagnostics));
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
    householdDataGenerationRef.current += 1;
    invalidateSupabaseReadThroughCache();
    clearTransientMessages();
    resetHouseholdOperations();
    setSupabaseReadState(null);
    setSupabaseReadError(false);
    setSupabasePlantIdsByLegacyId({});
    setHouseholdInvites([]);
    setHouseholdMembers([]);
    setAcceptedInvitationHousehold(null);
    setInvitationActionError("");
    setIsInvitationInboxOpen(false);
    setSelectedInboxInvitationId(null);
    setAcceptedInboxInvitationHousehold(null);
    setInboxInvitationActionError("");

    if (isSupabaseBackend) {
      setHouseholdLookupStatus(nextUserId ? "checking" : "complete");
      setIsAccessChecking(Boolean(nextUserId));
      clearHouseholdSession();
      setActiveHousehold(null);
      setCloudSyncEnabled(false);
      setCloudSyncReady(false);
      setAccessStatus("");
    } else {
      setHouseholdLookupStatus("complete");
    }
  }, [auth.loading, auth.user?.id]);

  useEffect(() => {
    if (activeHousehold || supabaseReadState) {
      markOnboardingComplete(browserStorage);
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

    const pendingInvite = browserStorage.getItem(pendingInviteStorageKey);
    if (!pendingInvite && inviteStatus === t("household.inviteStatusAuthRequired")) {
      setInviteStatus("");
    }
  }, [auth.isAuthenticated, auth.loading, inviteStatus, t]);

  useEffect(() => {
    if (!routeInviteToken) {
      return;
    }

    const token = normalizeInviteTokenInput(routeInviteToken);
    setJoinInviteInput(token);
    if (!auth.loading && !auth.isAuthenticated && token) {
      setOnboardingStep("welcome");
    }
  }, [auth.isAuthenticated, auth.loading, routeInviteToken, t]);

  useEffect(() => {
    if (auth.loading || !auth.isAuthenticated) {
      return;
    }

    const pendingInvite = browserStorage.getItem(pendingInviteStorageKey);
    if (!pendingInvite) {
      return;
    }

    browserStorage.removeItem(pendingInviteStorageKey);
    if (route.page !== "join") window.location.hash = `#/join?invite=${encodeURIComponent(pendingInvite)}`;
  }, [auth.isAuthenticated, auth.loading]);

  useEffect(() => {
    setAcceptedInvitationHousehold(null);
    setInvitationActionError("");
  }, [route.page === "join" ? `${route.invite}:${route.invitationId ?? ""}` : ""]);

  useEffect(() => {
    setIsInvitationInboxOpen(false);
    setSelectedInboxInvitationId(null);
    setAcceptedInboxInvitationHousehold(null);
    setInboxInvitationActionError("");
  }, [routeLifecycleKey]);

  useEffect(() => {
    if (route.page === "menu" && auth.user?.email_confirmed_at) void invitationInbox.refresh();
  }, [route.page, auth.user?.id, auth.user?.email_confirmed_at, invitationInbox.refresh]);

  useEffect(() => {
    if (!auth.isAuthenticated || !activeSupabaseHouseholdId) {
      householdPeopleRequestRef.current += 1;
      setHouseholdInvites([]);
      setHouseholdMembers([]);
      setHouseholdPeopleLoading(false);
      setHouseholdPeopleError("");
      return;
    }

    setHouseholdInvites([]);
    setHouseholdMembers([]);
    setHouseholdPeopleError("");
    void refreshHouseholdPeople(true);
  }, [activeSupabaseHouseholdId, auth.isAuthenticated]);

  useEffect(() => {
    if (!auth.isAuthenticated || !activeSupabaseHouseholdId || route.page !== "menu") return;
    const refreshOnReturn = () => {
      if (document.visibilityState !== "hidden") void refreshHouseholdPeople();
    };
    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, [auth.isAuthenticated, activeSupabaseHouseholdId, route.page]);

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

  useEffect(() => {
    if (!quickRecordStatus) {
      return;
    }

    const timeoutId = window.setTimeout(() => setQuickRecordStatus(""), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [quickRecordStatus]);

  const refreshSupabaseReadState = async () => {
    if (!isSupabaseReadThroughEnabled || !auth.isAuthenticated || !isHouseholdOperationCurrent()) {
      return null;
    }

    const generation = householdDataGenerationRef.current;
    if (isSupabaseBackend && !activeHousehold) return null;
    invalidateSupabaseReadThroughCache(activeHousehold);
    const nextState = await loadSupabaseReadThroughState(activeHousehold, { force: true });
    if (generation !== householdDataGenerationRef.current || !isHouseholdOperationCurrent()) return null;
    if (activeHousehold && !nextState) void householdDirectory.refresh(true);
    setSupabaseReadState(nextState);
    setSupabaseReadError(false);
    if (nextState) {
      setSupabasePlantIdsByLegacyId((current) =>
        areStringRecordsEqual(current, nextState.supabasePlantIdsByLegacyId) ? current : nextState.supabasePlantIdsByLegacyId,
      );
    }

    return nextState;
  };

  const refreshHouseholdPlanUsage = async () => {
    if (!auth.isAuthenticated || !activeSupabaseHouseholdId || !isHouseholdOperationCurrent()) return null;
    const nextSnapshot = await refreshSubscriptionState();
    if (nextSnapshot.status === "error") throw new Error(nextSnapshot.error ?? "Subscription status is unavailable.");
    return nextSnapshot.householdPlanUsage;
  };

  const refreshPlanAfterSubscription = async () => {
    let nextSnapshot = await refreshSubscriptionState();
    for (let attempt = 0;attempt < 6;attempt += 1) {
      if (nextSnapshot.view !== "syncing") return nextSnapshot;
      if (attempt < 5) await new Promise((resolve) => window.setTimeout(resolve, 1500));
      nextSnapshot = await refreshSubscriptionState();
    }
    return nextSnapshot;
  };

  const writeSupabaseFirst = async <T,>(operation: () => Promise<T>, mirrorLegacy: () => void) => {
    if (!isHouseholdOperationCurrent()) return false;
    const generation = householdDataGenerationRef.current;
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
        if (generation !== householdDataGenerationRef.current || !isHouseholdOperationCurrent()) return false;
        await refreshSupabaseReadState();
        await refreshHouseholdPlanUsage().catch(() => null);
        return true;
      } catch {
        if (isHouseholdOperationCurrent()) setSupabaseReadError(true);
        return false;
      }
    }

    const result = await runSupabaseWrite(operation);
    if (generation !== householdDataGenerationRef.current || !isHouseholdOperationCurrent()) return false;
    mirrorLegacy();

    if (result.mode === "fallback") {
      setSupabaseReadError(true);
      return false;
    }

    try {
      await refreshSupabaseReadState();
      await refreshHouseholdPlanUsage().catch(() => null);
    } catch {
      if (isHouseholdOperationCurrent()) setSupabaseReadError(true);
    }

    return true;
  };

  useEffect(() => {
    if (!isSupabaseReadThroughEnabled || auth.loading || !auth.isAuthenticated || isSupabaseAuthIdentityTransition || isSupabaseBackend && !activeHousehold) {
      setSupabaseReadState(null);
      setSupabaseReadError(false);
      return;
    }

    let cancelled = false;
    const started = { ...householdOperationScope, generation: householdDataGenerationRef.current };

    const loadReadThroughState = async () => {
      try {
        const nextState = await loadSupabaseReadThroughState(activeHousehold);
        if (!cancelled && isHouseholdOperationCurrent(started)) {
          if (activeHousehold && !nextState) void householdDirectory.refresh(true);
          setSupabaseReadState(nextState);
          setSupabaseReadError(false);
          if (nextState) {
            setSupabasePlantIdsByLegacyId((current) =>
              areStringRecordsEqual(current, nextState.supabasePlantIdsByLegacyId) ? current : nextState.supabasePlantIdsByLegacyId,
            );
          }
        }
      } catch {
        if (!cancelled && isHouseholdOperationCurrent(started)) {
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
    if (auth.loading) return;
    let cancelled = false;
    const generation = householdDataGenerationRef.current;
    const userId = auth.user?.id ?? null;
    const isCurrent = () => !cancelled && generation === householdDataGenerationRef.current && householdOperationScopeRef.current.userId === userId;

    const resolveHousehold = async () => {
      if (isSupabaseBackend && !auth.isAuthenticated) {
        clearHouseholdSession();
        setActiveHousehold(null);
        setAccessStatus("");
        setIsAccessChecking(false);
        setHouseholdLookupStatus("complete");
        return;
      }

      const urlToken = getHouseholdTokenFromUrl();
      const storedHousehold = getStoredHouseholdSession();
      const savedSelection = auth.user?.id ? readSelectedHouseholdId(browserStorage, auth.user.id) : null;
      const token = urlToken || savedSelection || storedHousehold?.publicToken || "";

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
          const households = await householdDirectory.refresh();
          if (!isCurrent()) return;
          if (!households) throw new Error("Household list could not be loaded.");
          const supabaseHousehold = resolveHouseholdSelection(households, token);
          if (!supabaseHousehold) {
            if (isCurrent()) {
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

        if (!isCurrent()) {
          return;
        }

        storeHouseholdSession(household);
        if (auth.user?.id && isSupabaseBackend) writeSelectedHouseholdId(browserStorage, auth.user.id, household.publicToken);
        setActiveHousehold(household);
        setBaseUrl(currentHouseholdBaseUrl(household.publicToken));
        setAccessStatus("");
        setHouseholdLookupStatus("complete");
      } catch {
        if (isCurrent()) {
          clearHouseholdSession();
          setActiveHousehold(null);
          setCloudSyncEnabled(false);
          setAccessStatus(t("household.linkInvalid"));
          setHouseholdLookupStatus("complete");
        }
      } finally {
        if (isCurrent()) {
          setIsAccessChecking(false);
        }
      }
    };

    void resolveHousehold();

    return () => {
      cancelled = true;
    };
  }, [auth.isAuthenticated, auth.loading, auth.user?.id, t, householdDirectory.refresh]);

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
    if (!isHouseholdOperationCurrent()) return;
    if (qrPdfExportRef.current) {
      return;
    }

    if (allFlowers.length === 0) {
      setQrExportStatus(t("qr.noPlantsExport"));
      return;
    }

    if (subscription.status !== "ready" || !subscription.householdEntitlement) {
      setQrExportStatus(subscriptionCopy.entitlementUnknown);
      return;
    }
    if (!subscription.householdEntitlement.isPremium && allFlowers.length > freeQrLabelLimit) {
      setQrExportStatus(subscriptionCopy.freeQrLimit);
      return;
    }

    // Both export buttons share a lock before React commits their busy state.
    const exportRequest = Symbol();
    qrPdfExportRef.current = exportRequest;
    try {
      setIsExportingQrPdf(true);
      setQrExportStatus(t("qr.exportGenerating"));
      await exportQrLabelsPdf(allFlowers, baseUrl);
      if (!isHouseholdOperationCurrent()) return;
      setQrExportStatus(t("qr.exportReady"));
    } catch (error) {
      if (!isHouseholdOperationCurrent()) return;
      setQrExportStatus(error instanceof Error ? error.message : t("qr.exportFailed"));
    } finally {
      if (qrPdfExportRef.current === exportRequest) {
        qrPdfExportRef.current = null;
        if (isHouseholdOperationCurrent()) setIsExportingQrPdf(false);
      }
    }
  };

  const { startHouseholdNameEdit, renderHouseholdNameEditor } = useHouseholdManagement({
    setSupabaseReadState,
    setActiveHousehold,
    setHouseholdNameDraft,
    householdDirectory,
    setHouseholdNameEditDraft,
    householdDisplayName,
    setHouseholdNameEditStatus,
    setHouseholdNameEditStatusTone,
    setHouseholdNameEditSurface,
    isHouseholdOperationCurrent,
    isSavingHouseholdName,
    activeSupabaseHouseholdId,
    householdPermissions,
    t,
    householdNameEditDraft,
    transientMessageGenerationRef,
    setIsSavingHouseholdName,
    isTransientMessageGenerationCurrent,
    householdNameEditSurface,
    householdNameEditStatus,
    householdNameEditStatusTone,
    householdNameEditStatusClass,
    canRenameHousehold,
  });

  useEffect(() => {
    if (!auth.isAuthenticated || householdDirectory.loading || householdDirectory.error || !activeHousehold) return;
    if (householdDirectory.households.some((household) => household.id === activeHousehold.publicToken || household.legacyPublicToken === activeHousehold.publicToken)) return;
    const fallback = householdDirectory.households[0];
    if (fallback) selectHousehold(fallback.id);
    else {
      householdDataGenerationRef.current += 1;
      invalidateSupabaseReadThroughCache();
      clearTransientMessages();
      resetHouseholdOperations();
      clearHouseholdSession();
      removeHouseholdFromCurrentUrl();
      setActiveHousehold(null);
      setSupabaseReadState(null);
      setSupabasePlantIdsByLegacyId({});
      setHouseholdMembers([]);
      setHouseholdInvites([]);
    }
  }, [auth.isAuthenticated, householdDirectory.loading, householdDirectory.error, householdDirectory.households, activeHousehold]);

  useEffect(() => {
    if (auth.isAuthenticated && activeHousehold && subscription.status === "error") void householdDirectory.refresh(true);
  }, [auth.isAuthenticated, activeHousehold?.publicToken, subscription.status, householdDirectory.refresh]);

  useEffect(() => {
    const expiresAt = Date.parse(householdEntitlement?.validUntil ?? "");
    if (!householdEntitlement?.isPremium || !Number.isFinite(expiresAt)) return;
    let timer: number;
    const checkExpiry = () => {
      const remaining = expiresAt - Date.now();
      if (remaining > 0) {
        timer = window.setTimeout(checkExpiry, Math.min(remaining + 1, 2_147_483_647));
      } else if (isHouseholdOperationCurrent()) {
        void refreshSubscriptionState();
        void householdDirectory.refresh(true);
      }
    };
    checkExpiry();
    return () => window.clearTimeout(timer);
  }, [householdEntitlement?.isPremium, householdEntitlement?.validUntil, auth.user?.id, activeHousehold?.publicToken, householdDirectory.refresh]);

  const closeInvitationCenter = () => {
    if (isJoiningInvite || isDecliningInvitation) return;
    setIsInvitationInboxOpen(false);
    setSelectedInboxInvitationId(null);
    setAcceptedInboxInvitationHousehold(null);
    setInboxInvitationActionError("");
  };

  const openInboxInvitation = (invitation: HouseholdInvitation) => {
    setAcceptedInboxInvitationHousehold(null);
    setInboxInvitationActionError("");
    setIsInvitationInboxOpen(false);
    setSelectedInboxInvitationId(invitation.id);
  };

  const returnToInvitationInbox = () => {
    if (isJoiningInvite || isDecliningInvitation) return;
    setSelectedInboxInvitationId(null);
    setAcceptedInboxInvitationHousehold(null);
    setInboxInvitationActionError("");
    setIsInvitationInboxOpen(true);
    void invitationInbox.refresh();
  };

  const renderHeroActions = () => (
    <div className="hero-actions">
      {auth.isAuthenticated ? <>
        <InvitationInboxButton buttonRef={invitationMailboxRef} count={invitationInbox.invitations.length} loading={invitationInbox.loading} expanded={isInvitationInboxOpen || Boolean(selectedInboxInvitationId)} language={selectedLanguage} onClick={() => {
          if (isJoiningInvite || isDecliningInvitation) return;
          if (isInvitationInboxOpen || selectedInboxInvitationId) closeInvitationCenter();
          else { setIsHouseholdSheetOpen(false); setIsInvitationInboxOpen(true); void invitationInbox.refresh(); }
        }} />
        {isInvitationInboxOpen || selectedInboxInvitationId ? <InvitationCenterOverlay
          anchorRef={invitationMailboxRef} mode={selectedInboxInvitationId ? "details" : "inbox"}
          title={acceptedInboxInvitationHousehold ? invitationCopy.acceptedTitle(acceptedInboxInvitationHousehold.name)
            : selectedInboxInvitationId && inboxInvitationReview.invitation ? invitationCopy.title(inboxInvitationReview.invitation.householdName) : invitationCopy.inboxTitle}
          onClose={closeInvitationCenter}
          busy={isJoiningInvite || isDecliningInvitation} closeLabel={invitationCopy.close}
          onBack={selectedInboxInvitationId && !acceptedInboxInvitationHousehold ? returnToInvitationInbox : undefined}
          backLabel={invitationCopy.backToInbox}
        >
          {selectedInboxInvitationId ? <HouseholdInvitationReview
            key={selectedInboxInvitationId} invitation={inboxInvitationReview.invitation} user={auth.user} language={selectedLanguage}
            loading={inboxInvitationReview.loading} error={inboxInvitationReview.error}
            accepting={isJoiningInvite} declining={isDecliningInvitation} acceptedHousehold={acceptedInboxInvitationHousehold}
            actionError={inboxInvitationActionError} onAccept={(invitation) => void handleAcceptInvitation(invitation, "inbox")}
            onDecline={(invitation) => void handleDeclineInvitation(invitation, "inbox")} onUseAnotherAccount={() => void handleInvitationAccountChange("inbox")}
            onCancel={returnToInvitationInbox} onStay={closeInvitationCenter} onSwitch={selectHousehold} onRetry={inboxInvitationReview.refresh}
          /> : <HouseholdInvitationInbox invitations={invitationInbox.invitations} loading={invitationInbox.loading}
            error={invitationInbox.error} language={selectedLanguage} onClose={closeInvitationCenter}
            onRetry={() => void invitationInbox.refresh(true)} onView={openInboxInvitation} />}
        </InvitationCenterOverlay> : null}
      </> : null}
      <button className="user-menu-trigger" type="button" onClick={() => { if (isJoiningInvite || isDecliningInvitation) return; closeInvitationCenter(); setIsHouseholdSheetOpen(true); }} aria-label={t("household.openMenu")}>
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
      <HouseholdSheet
        isSigningOut={isSigningOut}
        isSavingHouseholdName={isSavingHouseholdName}
        setIsHouseholdSheetOpen={setIsHouseholdSheetOpen}
        t={t}
        renderHouseholdNameEditor={renderHouseholdNameEditor}
        currentUserEmail={currentUserEmail}
        auth={auth}
        householdNameEditStatus={householdNameEditStatus}
        householdNameEditSurface={householdNameEditSurface}
        householdNameEditStatusClass={householdNameEditStatusClass}
        renderHouseholdSwitcher={renderHouseholdSwitcher}
        householdMembers={householdMembers}
        allFlowers={allFlowers}
        handleAccountSignOut={handleAccountSignOut}
      />
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

  const { updateCareRecord, saveQuickRecord, saveFlower, addFlower, removeFlowerById } = usePlantPersistence({
    isHouseholdOperationCurrent,
    supabasePlantIdsByLegacyId,
    supabaseWriteMode,
    writeSupabaseFirst,
    updateRecord,
    setQuickRecordStatus,
    t,
    isSupabaseOnlyDataMode,
    setSupabaseReadError,
    isUsingSupabaseReadState,
    setSupabaseReadState,
    pendingQuickRecordKey,
    setPendingQuickRecordKey,
    supabaseReadState,
    updateFlower,
    refreshSupabaseReadState,
    addCustomFlower,
    removeFlower,
  });

  const { refreshHouseholdPeople, handleCreateInvite, handleCopyInviteLink, handleRetryInviteEmail, handleRemoveHouseholdPerson } = useInvitationActions({
    auth,
    activeSupabaseHouseholdId,
    isHouseholdOperationCurrent,
    householdPeopleRequestRef,
    setHouseholdPeopleLoading,
    setHouseholdPeopleError,
    householdPeopleScopeRef,
    setHouseholdMembers,
    setHouseholdInvites,
    t,
    setInviteStatusTone,
    setInviteStatus,
    isCreatingInvite,
    setOnboardingStep,
    canInviteToHousehold,
    inviteEmail,
    householdMembers,
    householdInvites,
    transientMessageGenerationRef,
    setIsCreatingInvite,
    isTransientMessageGenerationCurrent,
    setInviteEmail,
    setIsInvitePanelOpen,
    refreshSubscriptionState,
    householdPermissions,
    sendingInviteId,
    setSendingInviteId,
    removingPersonKeysRef,
    setRemovingPersonKeys,
  });

  const handleAccountSignOut = async () => {
    if (signingOutRef.current) {
      return;
    }

    if (!window.confirm(t("account.signOutConfirm"))) {
      return;
    }

    const userId = auth.user?.id ?? null;
    signingOutRef.current = true;
    try {
      setIsSigningOut(true);
      setAccountActionStatus(t("account.signingOut"));
      await signOut();
      if (householdOperationScopeRef.current.userId && householdOperationScopeRef.current.userId !== userId) return;
      clearHouseholdSession();
      setActiveHousehold(null);
      setSupabaseReadState(null);
      setHouseholdInvites([]);
      setHouseholdMembers([]);
      setIsHouseholdSheetOpen(false);
      setAccountActionStatus("");
      window.location.hash = "#/menu?section=account";
    } catch (error) {
      if (householdOperationScopeRef.current.userId !== userId) return;
      setAccountActionStatus(error instanceof Error ? error.message : t("account.signOutFailed"));
    } finally {
      signingOutRef.current = false;
      setIsSigningOut(false);
    }
  };

  const { leaveInvitationReview, handleJoinInvite, handleAcceptInvitation, handleDeclineInvitation, handleInvitationAccountChange } = useInvitationReviewActions({
    pendingInviteStorageKey,
    setJoinInviteInput,
    joinInviteInput,
    setInviteStatus,
    t,
    joinInviteOnceRef,
    auth,
    decliningInvitationRef,
    invitationRouteKey,
    householdOperationScopeRef,
    invitationRouteKeyRef,
    activeHousehold,
    setInboxInvitationActionError,
    setInvitationActionError,
    setIsJoiningInvite,
    householdDirectory,
    invitationInbox,
    invitationReview,
    inboxInvitationReview,
    householdDataGenerationRef,
    setActiveHousehold,
    setBaseUrl,
    setAcceptedInboxInvitationHousehold,
    setAcceptedInvitationHousehold,
    isJoiningInvite,
    setIsDecliningInvitation,
    signingOutRef,
    setSupabaseReadState,
  });

  const { selectHousehold, renderHouseholdSwitcher, changeHousehold } = useHouseholdSelectionActions({
    householdDirectory,
    auth,
    householdDataGenerationRef,
    clearTransientMessages,
    resetHouseholdOperations,
    setHouseholdLookupStatus,
    setIsAccessChecking,
    setSupabaseReadState,
    setSupabaseReadError,
    setSupabasePlantIdsByLegacyId,
    setHouseholdMembers,
    setHouseholdInvites,
    setHouseholdPeopleError,
    setHouseholdNameEditSurface,
    setIsInvitePanelOpen,
    setInviteEmail,
    setIsAddPlantModalOpen,
    setIsDiagnosisModalOpen,
    setCarePreview,
    setDeleteFlowerId,
    setEditingNameFlowerId,
    setOpenDiagnosticId,
    setQuery,
    setCloudSyncEnabled,
    setCloudSyncReady,
    setActiveHousehold,
    setBaseUrl,
    setIsHouseholdSheetOpen,
    setIsInvitationInboxOpen,
    setSelectedInboxInvitationId,
    activeHousehold,
    t,
    invitationCopy,
  });

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

  const { handleGenerateCarePreview, confirmCareUpdate, isApplyingCare } = useCareActions({
    isHouseholdOperationCurrent,
    isGeneratingCarePreview,
    resolveCurrentAiDiagnosisAccess,
    setCarePreviewStatus,
    aiDiagnosisAccessMessage,
    setIsGeneratingCarePreview,
    t,
    supabasePlantIdsByLegacyId,
    auth,
    activeSupabaseHouseholdId,
    selectedLanguage,
    setCarePreview,
    carePreview,
    flowerById,
    saveFlower,
  });

  const { openDiagnosisModal, closeDiagnosisModal, handleDiagnosisImageChange, runPlantDiagnosis, savePlantDiagnosis, updateDiagnosticHistoryEntry, updateDiagnosticConfirmation } = useDiagnosisActions({
    resolveCurrentAiDiagnosisAccess,
    aiDiagnosisAccessMessage,
    setDiagnosisStatus,
    setDiagnosisUpgradeReason,
    diagnosisImageSelection,
    setDiagnosisDraft,
    setDiagnosisSymptomNotes,
    setDiagnosisUserNote,
    setIsDiagnosisModalOpen,
    isDiagnosing,
    isSavingDiagnosis,
    isHouseholdOperationCurrent,
    diagnosisImageDataUrl,
    setIsDiagnosing,
    t,
    auth,
    activeSupabaseHouseholdId,
    diagnosisSymptomNotes,
    selectedLanguage,
    refreshHouseholdPlanUsage,
    setSupabaseReadState,
    getSupabaseDiagnosticId,
    diagnosisDraft,
    flowerById,
    diagnosisUserNote,
    supabasePlantIdsByLegacyId,
    setIsSavingDiagnosis,
    supabaseWriteMode,
    setSupabaseReadError,
    setOpenDiagnosticId,
    refreshSupabaseReadState,
    logTechnicalError,
    isSupabaseOnlyDataMode,
    setDiagnostics,
    diagnostics,
    setDiagnosticHistoryStatus,
    pendingDiagnosticUpdateKey,
    setPendingDiagnosticUpdateKey,
  });

  const selectOnboardingLanguage = (language: PlantieLanguage) => {
    writeStoredLanguage(browserStorage, language);
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

  const { handleCreateHousehold, handleCreateOnboardingHousehold } = useHouseholdCreation({
    isHouseholdOperationCurrent,
    isCreatingHousehold,
    auth,
    setAccessStatus,
    t,
    setOnboardingStep,
    householdNameDraft,
    transientMessageGenerationRef,
    setIsCreatingHousehold,
    householdDirectory,
    householdDataGenerationRef,
    resetHouseholdOperations,
    setHouseholdLookupStatus,
    setIsAccessChecking,
    isUuid,
    setActiveHousehold,
    setBaseUrl,
    isTransientMessageGenerationCurrent,
    setIsNewOnboardingHousehold,
    householdOperationScopeRef,
  });

  const releaseEnv = {
    viteRevenueCatAndroidKey: import.meta.env.VITE_REVENUECAT_API_KEY_ANDROID,
    viteRevenueCatIosKey: import.meta.env.VITE_REVENUECAT_API_KEY_IOS,
    viteSupabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    viteSupabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  };

  const { startNameEdit, cancelNameEdit, confirmNameEdit, confirmRemoveCustomFlower, handleAddCustomFlower, openAddPlantModal, closeAddPlantModal, openAddPlantFromMobileNav, isSavingPlantName, plantMutationStatus } = usePlantActions({
    scopeKey: imageSelectionScope,
    isHouseholdOperationCurrent,
    plantSubmissionRef,
    newImageSelection,
    newPlantName,
    newPlantImage,
    setNewPlantStatus,
    t,
    setIsAddingPlant,
    pendingPlantIdRef,
    activeSupabaseHouseholdId,
    selectedLanguage,
    addFlower,
    refreshHouseholdPlanUsage,
    setNewPlantName,
    setIsAddPlantModalOpen,
    setEditingNameFlowerId,
    setDraftFlowerName,
    draftFlowerName,
    saveFlower,
    deleteFlowerId,
    isRemovingPlant,
    setIsRemovingPlant,
    removeFlowerById,
    setDeleteFlowerId,
    route,
  });
  const navigateBack = (fallbackHash = "#/") => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.hash = fallbackHash;
  };

  if ((isSupabaseAuthIdentityTransition && !auth.isPasswordRecovery && !auth.invalidRecoveryLink) ||
    (auth.loading && isSupabaseConfigured && route.page !== "legal" && route.page !== "health" && route.page !== "release-readiness")) {
    return (
      <main className="app-shell access-shell onboarding-shell">
        <section className="access-card onboarding-card household-loading-panel" aria-busy="true" aria-live="polite">
          <span className="loading-wheel" aria-hidden="true" />
          <p>{t("auth.loading")}</p>
        </section>
      </main>
    );
  }

  if (auth.invalidRecoveryLink) {
    const message = authPanelNoticeContent("invalid_link", selectedLanguage);
    const cleanupMessage = authPanelNoticeContent("unavailable", selectedLanguage);
    return <main className="app-shell access-shell onboarding-shell">
      <section className="access-card onboarding-card auth-recovery-card" aria-labelledby="invalid-recovery-title">
        <div className="section-title"><KeyRound size={22} aria-hidden="true" /><h1 id="invalid-recovery-title">{message.title}</h1></div>
        <AuthMessage severity="warning">{message.body}</AuthMessage>
        {recoveryExitFailed ? <AuthMessage severity="error" title={cleanupMessage.title}>{cleanupMessage.body}</AuthMessage> : null}
        <LoadingButton className="primary-action" type="button" isLoading={isLeavingRecovery} loadingLabel={t("auth.loading")} onClick={() => { void requestNewRecoveryLink(); }}>{authPanelCopy(selectedLanguage).requestNewReset}</LoadingButton>
      </section>
    </main>;
  }

  if (auth.callbackError) {
    return (
      <main className="app-shell access-shell onboarding-shell">
        {renderHeroActions()}
        {renderHouseholdSheet()}
        <section className="access-card onboarding-card" aria-labelledby="auth-callback-error-title">
          <div className="section-title">
            <KeyRound size={22} aria-hidden="true" />
            <h1 id="auth-callback-error-title">{t("auth.invalidCallbackTitle")}</h1>
          </div>
          <p>{t("auth.invalidCallbackBody")}</p>
          <button className="neutral-action" type="button" onClick={auth.dismissCallbackError}>
            {t("auth.invalidCallbackAction")}
          </button>
          <AuthPanel compact initialMode="login" language={selectedLanguage} onSuccess={() => { auth.dismissCallbackError(); auth.dismissRecoveryError(); }} />
        </section>
      </main>
    );
  }

  if (auth.isPasswordRecovery) {
    return (
      <main className="app-shell access-shell onboarding-shell">
        <section className="access-card onboarding-card auth-recovery-card" aria-labelledby="password-recovery-title">
          <div className="section-title">
            <KeyRound size={22} aria-hidden="true" />
            <h1 id="password-recovery-title">{t("auth.newPasswordTitle")}</h1>
          </div>
          <p>{t("auth.newPasswordBody")}</p>
          {recoveryExitFailed ? <AuthMessage severity="error">{authPanelNoticeContent("unavailable", selectedLanguage).body}</AuthMessage> : null}
          <AuthPanel key={auth.recoveryFlowId} compact initialMode="updatePassword" language={selectedLanguage} onPasswordUpdated={completeRecovery} onRequestPasswordReset={requestNewRecoveryLink} />
        </section>
      </main>
    );
  }

  if (route.page === "join") {
    return (
      <main className="app-shell compact">
        <header className="topbar topbar-with-actions">
          <a className="icon-link" href="#/menu" onClick={navigateBack("#/menu")} aria-label={t("nav.backToMenu")}>
            <ArrowLeft size={22} aria-hidden="true" />
          </a>
          <div>
            <p className="eyebrow">{t("household.familyInvite")}</p>
            <h1>{t("household.joinTitle")}</h1>
          </div>
          {renderHeroActions()}
        </header>
        {!route.invite && route.invitationId && !auth.user?.email_confirmed_at ? <section className="household-invitation-review">
          <h2>{invitationCopy.inboxTitle}</h2>
          <p>{auth.isAuthenticated ? invitationCopy.verifyEmail : invitationCopy.reviewAfterAuth}</p>
          {!auth.isAuthenticated ? <AuthPanel compact invitationId={route.invitationId} language={selectedLanguage} /> : <button className="neutral-action" type="button" onClick={() => window.location.reload()}>{invitationCopy.retry}</button>}
        </section> : <HouseholdInvitationReview
          key={route.invitationId ?? route.invite}
          invitation={invitationReview.invitation} user={auth.user} language={selectedLanguage}
          loading={auth.loading || invitationReview.loading} error={invitationReview.error}
          accepting={isJoiningInvite} declining={isDecliningInvitation} acceptedHousehold={acceptedInvitationHousehold}
          actionError={invitationActionError} onAccept={(invitation) => void handleAcceptInvitation(invitation)}
          onDecline={(invitation) => void handleDeclineInvitation(invitation)} onUseAnotherAccount={() => void handleInvitationAccountChange()}
          onCancel={leaveInvitationReview} onStay={leaveInvitationReview} onSwitch={selectHousehold} onRetry={invitationReview.refresh}
        />}
        {renderHouseholdSheet()}
      </main>
    );
  }

  if (route.page === "legal" || route.page === "release-readiness" || route.page === "health") {
    return (
      <main className="app-shell compact">
        <header className="topbar topbar-with-actions">
          <a className="icon-link" href="#/" onClick={navigateBack("#/")} aria-label={t("nav.backToPlantie")}>
            <ArrowLeft size={22} aria-hidden="true" />
          </a>
          <div>
            <p className="eyebrow">Plantie release</p>
            <h1>{route.page === "health" ? "Health" : route.page === "release-readiness" ? "Readiness" : "Compliance"}</h1>
          </div>
          {renderHeroActions()}
        </header>
        {route.page === "legal" ? (
          <LegalPageView
            deleteRequestStatus={deleteAccountStatus}
            isDeleteRequestPending={isRequestingAccountDeletion}
            onRequestDeletion={auth.isAuthenticated ? requestAccountDeletion : undefined}
            pageId={route.legalPageId}
            canRequestDeletion={auth.isAuthenticated}
            language={selectedLanguage}
            requestEmail={auth.user?.email ?? ""}
          />
        ) : route.page === "release-readiness" ? (
          <ReleaseChecklistPage />
        ) : (
          <HealthPage backendStatus={healthEndpointStatus} env={releaseEnv} />
        )}
        {renderHouseholdSheet()}
      </main>
    );
  }

  if ((isSupabaseHouseholdPending || (!shouldUseSupabaseAccountData && isAccessChecking)) && !currentRouteAllowedWithoutHousehold) {
    return renderHouseholdLoading();
  }

  if (auth.isAuthenticated && route.page !== "menu" && onboardingStep !== "complete" && !activeHousehold && !supabaseReadState) {
    if (onboardingStep === "language") {
      return (
        <main className="app-shell access-shell onboarding-shell">
          {renderHeroActions()}
          {renderHouseholdSheet()}
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
          {renderHeroActions()}
          {renderHouseholdSheet()}
          <section className="access-card onboarding-card" aria-labelledby="welcome-title">
            <div className="section-title">
              <Sprout size={24} aria-hidden="true" />
              <h1 id="welcome-title">Plantie</h1>
            </div>
            <p>{t("onboarding.valueProp")}</p>
            <div className="onboarding-actions">
              <button className="primary-action" type="button" onClick={continueToHouseholdSetup}>
                {t("onboarding.continueHousehold")}
              </button>
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
        {renderHeroActions()}
        {renderHouseholdSheet()}
        <section className="access-card onboarding-card" aria-labelledby="household-title">
          <div className="section-title">
            <Home size={22} aria-hidden="true" />
            <h1 id="household-title">{t("household.createOrJoin")}</h1>
          </div>
          <p>{t("household.privateBody")}</p>
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
          {accessStatus || onboardingStatus ? <p className="access-status">{accessStatus || onboardingStatus}</p> : null}
        </section>
      </main>
    );
  }

  if (auth.isAuthenticated && !activeHousehold && !supabaseReadState && !currentRouteAllowedWithoutHousehold) {
    return (
      <main className="app-shell access-shell">
        {renderHeroActions()}
        {renderHouseholdSheet()}
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
          {accessStatus ? <p className="access-status">{accessStatus}</p> : null}
        </section>
      </main>
    );
  }

  return <AppRouter route={route} shared={{ t, renderHeroActions, renderHouseholdSheet, openAddPlantFromMobileNav }}
    detail={{
      flowerById,
      navigateBack,
      records,
      baseUrl,
      carePreview,
      editingNameFlowerId,
      resolveCurrentAiDiagnosisAccess,
      aiDiagnosisAccessMessage,
      currentHouseholdPlanUsage,
      freeAiDiagnosisMonthlyLimit,
      aiDiagnosisDisabledActionLabel,
      diagnostics,
      draftFlowerName,
      setDraftFlowerName,
      confirmNameEdit,
      cancelNameEdit,
      startNameEdit,
      quickRecordStatus,
      saveQuickRecord,
      pendingQuickRecordKey,
      openDiagnosisModal,
      formatAppDate,
      formatAppElapsedDays,
      formatAppWateringStatus,
      isGeneratingCarePreview,
      handleGenerateCarePreview,
      carePreviewStatus,
      updateCareRecord,
      diagnosticHistoryStatus,
      openDiagnosticId,
      localizedConfidenceLabel,
      setOpenDiagnosticId,
      updateDiagnosticHistoryEntry,
      updateDiagnosticConfirmation,
      pendingDiagnosticUpdateKey,
      selectedLanguage,
      setDeleteFlowerId,
      setCarePreview,
      confirmCareUpdate,
      isApplyingCare,
      isDiagnosisModalOpen,
      isDiagnosing,
      isSavingDiagnosis,
      closeDiagnosisModal,
      diagnosisSymptomNotes,
      setDiagnosisSymptomNotes,
      isCapturingDiagnosisImage,
      handleDiagnosisImageChange,
      diagnosisImageSelection,
      diagnosisImageDataUrl,
      diagnosisImagePreviewUrl,
      diagnosisStatus,
      runPlantDiagnosis,
      diagnosisDraft,
      diagnosisUserNote,
      setDiagnosisUserNote,
      savePlantDiagnosis,
      diagnosisUpgradeReason,
      setDiagnosisUpgradeReason,
      subscription,
      refreshPlanAfterSubscription,
      deleteFlowerId,
      confirmRemoveCustomFlower,
      isRemovingPlant,
      isSavingPlantName,
      plantMutationStatus,
    }}
    menu={{
      auth,
      authEntry,
      selectedLanguage,
      selectOnboardingLanguage,
      joinInviteInput,
      setJoinInviteInput,
      handleJoinInvite,
      isJoiningInvite,
      inviteStatus,
      inviteStatusClass,
      setAuthEntry,
      navigateBack,
      handleAccountSignOut,
      isSigningOut,
      accountActionStatus,
      refreshHouseholdPeople,
      activeHousehold,
      supabaseReadState,
      householdDisplayName,
      canRenameHousehold,
      householdNameEditSurface,
      startHouseholdNameEdit,
      renderHouseholdNameEditor,
      householdEntitlement,
      invitationCopy,
      usedHouseholdSlots,
      renderHouseholdSwitcher,
      activeSupabaseHouseholdId,
      householdPeople,
      householdPeopleLoading,
      householdPeopleError,
      currentHouseholdMember,
      removingPersonKeys,
      canInviteToHousehold,
      isInvitePanelOpen,
      setIsInvitePanelOpen,
      handleRemoveHouseholdPerson,
      handleRetryInviteEmail,
      handleCopyInviteLink,
      sendingInviteId,
      subscription,
      subscriptionCopy,
      isCreatingInvite,
      handleCreateInvite,
      inviteEmail,
      setInviteEmail,
      handleCreateHousehold,
      householdNameDraft,
      setHouseholdNameDraft,
      isCreatingHousehold,
      changeHousehold,
      householdNameEditStatus,
      inviteStatusTone,
      householdNameEditStatusTone,
      setInviteStatus,
      setHouseholdNameEditStatus,
      refreshSubscriptionState,
      refreshPlanAfterSubscription,
    }}
    diagnose={{
      navigateBack,
      query,
      setQuery,
      filteredFlowers,
      visibleFlowers,
      diagnostics,
      allFlowers,
      plantPageSize,
      plantPage,
      setPlantPage,
      plantPageCount,
    }}
    qr={{
      navigateBack,
      handleQrPdfExport,
      isExportingQrPdf,
      baseUrl,
      setBaseUrl,
      allFlowers,
      qrLabelValidation,
      qrExportStatus,
      selectedLanguage,
    }}
    dashboard={{
      allFlowers,
      isAddPlantModalOpen,
      query,
      setQuery,
      newPlantName,
      setNewPlantName,
      newPlantStatus,
      isAddingPlant,
      plantLimitReached,
      newImageSelection,
      handleAddCustomFlower,
      closeAddPlantModal,
      isNewOnboardingHousehold,
      customFlowers,
      openAddPlantModal,
      visibleFlowers,
      records,
      formatAppWateringStatus,
      updateCareRecord,
      filteredFlowers,
      plantPageSize,
      plantPage,
      setPlantPage,
      plantPageCount,
    }}
  />;
};
