import type { Flower } from "../../../data/flowers";
import { useAuth } from "../../../hooks/useAuth";
import { useImageSelection } from "../../../hooks/useImageSelection";
import type { AiDiagnosisAccessResult } from "../../../lib/aiDiagnosisAccess";
import type { HouseholdPlanUsage } from "../../../lib/householdPlanService";
import { createTranslator } from "../../../lib/i18n";
import type { ImageCaptureSource, ImagePickerLabels } from "../../../lib/imageCaptureService";
import { imageErrorMessage } from "../../../lib/imageUploadErrors";
import type { PlantieLanguage } from "../../../lib/onboarding";
import type { SupabaseReadThroughState } from "../../../lib/supabaseReadThrough";
import type { SupabaseWriteMode } from "../../../lib/supabaseSourceOfTruth";
import {
  createSupabaseDiagnosis,
  updateSupabaseDiagnosis
} from "../../../lib/supabaseSourceOfTruth";
import type { DiagnosisConfirmation, PlantDiagnosisDraft, PlantDiagnosticEntry } from "../../../utils/diagnostics";
import {
  createDiagnosticId,
  fetchPlantDiagnosis,
  sanitizeDiagnosticNote
} from "../../../utils/diagnostics";

type Dependencies = {
  resolveCurrentAiDiagnosisAccess: () => AiDiagnosisAccessResult;
  aiDiagnosisAccessMessage: (access: AiDiagnosisAccessResult) => string;
  setDiagnosisStatus: React.Dispatch<React.SetStateAction<string>>;
  setDiagnosisUpgradeReason: React.Dispatch<React.SetStateAction<string>>;
  diagnosisImageSelection: ReturnType<typeof useImageSelection>;
  setDiagnosisDraft: React.Dispatch<React.SetStateAction<PlantDiagnosisDraft | null>>;
  setDiagnosisSymptomNotes: React.Dispatch<React.SetStateAction<string>>;
  setDiagnosisUserNote: React.Dispatch<React.SetStateAction<string>>;
  setIsDiagnosisModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isDiagnosing: boolean;
  isSavingDiagnosis: boolean;
  isHouseholdOperationCurrent: (started?: { userId: string | null; householdToken: string | null; generation: number; }) => boolean;
  diagnosisImageDataUrl: string;
  setIsDiagnosing: React.Dispatch<React.SetStateAction<boolean>>;
  t: ReturnType<typeof createTranslator>;
  auth: ReturnType<typeof useAuth>;
  activeSupabaseHouseholdId: string;
  diagnosisSymptomNotes: string;
  selectedLanguage: PlantieLanguage | null;
  refreshHouseholdPlanUsage: () => Promise<HouseholdPlanUsage | null>;
  setSupabaseReadState: React.Dispatch<React.SetStateAction<SupabaseReadThroughState | null>>;
  getSupabaseDiagnosticId: (diagnostic: PlantDiagnosticEntry) => string;
  diagnosisDraft: PlantDiagnosisDraft | null;
  flowerById: Map<string, Flower>;
  diagnosisUserNote: string;
  supabasePlantIdsByLegacyId: Record<string, string>;
  setIsSavingDiagnosis: React.Dispatch<React.SetStateAction<boolean>>;
  supabaseWriteMode: SupabaseWriteMode;
  setSupabaseReadError: React.Dispatch<React.SetStateAction<boolean>>;
  setOpenDiagnosticId: React.Dispatch<React.SetStateAction<string>>;
  refreshSupabaseReadState: () => Promise<SupabaseReadThroughState | null>;
  logTechnicalError: (message: string, error: unknown) => void;
  isSupabaseOnlyDataMode: boolean;
  setDiagnostics: React.Dispatch<React.SetStateAction<PlantDiagnosticEntry[]>>;
  diagnostics: PlantDiagnosticEntry[];
  setDiagnosticHistoryStatus: React.Dispatch<React.SetStateAction<string>>;
  pendingDiagnosticUpdateKey: string;
  setPendingDiagnosticUpdateKey: React.Dispatch<React.SetStateAction<string>>;
};

export const useDiagnosisActions = ({
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
  setPendingDiagnosticUpdateKey
}: Dependencies) => {
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

    diagnosisImageSelection.clear();
    setDiagnosisDraft(null);
    setDiagnosisSymptomNotes("");
    setDiagnosisUserNote("");
    setDiagnosisStatus("");
    setDiagnosisUpgradeReason("");
    setIsDiagnosisModalOpen(true);
  };

  const closeDiagnosisModal = () => {
    if (isDiagnosing || isSavingDiagnosis) {
      return;
    }

    diagnosisImageSelection.cancel();
    setIsDiagnosisModalOpen(false);
  };

  const handleDiagnosisImageChange = async (source: ImageCaptureSource, file?: File, pickerLabels?: ImagePickerLabels) => {
    if (!isHouseholdOperationCurrent() || isDiagnosing) return;
    const access = resolveCurrentAiDiagnosisAccess();
    if (!access.allowed) {
      setDiagnosisStatus(aiDiagnosisAccessMessage(access));
      return;
    }
    await diagnosisImageSelection.select(source, file, pickerLabels);
  };

  const runPlantDiagnosis = async (flower: Flower) => {
    if (!isHouseholdOperationCurrent()) return;
    if (!diagnosisImageDataUrl || isDiagnosing || diagnosisImageSelection.isBusy()) {
      return;
    }

    setIsDiagnosing(true);
    setDiagnosisStatus(t("diagnosis.accessChecking"));

    try {
      setDiagnosisStatus(t("image.validatingSafety"));
      if (!isHouseholdOperationCurrent()) return;

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
        selectedLanguage,
      );
      if (!isHouseholdOperationCurrent()) return;
      setDiagnosisDraft(diagnosis);
      await refreshHouseholdPlanUsage().catch(() => null);
      if (!isHouseholdOperationCurrent()) return;
      setDiagnosisStatus(diagnosis.confidence < 45 ? t("diagnosis.lowConfidence") : "");
    } catch (error) {
      if (!isHouseholdOperationCurrent()) return;
      setDiagnosisDraft(null);
      setDiagnosisStatus(imageErrorMessage(error, selectedLanguage) ?? t("diagnosis.failed"));
    } finally {
      if (isHouseholdOperationCurrent()) setIsDiagnosing(false);
    }
  };

  const upsertSupabaseDiagnosisInReadState = (entry: PlantDiagnosticEntry) => {
    if (!isHouseholdOperationCurrent()) return;
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
    if (!isHouseholdOperationCurrent()) return;
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
        if (!isHouseholdOperationCurrent()) return;
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
          if (!isHouseholdOperationCurrent()) return;
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
      if (!isHouseholdOperationCurrent()) return;
      logTechnicalError("Supabase diagnosis save failed.", error);
      if (isSupabaseOnlyDataMode || supabaseWriteMode === "supabase-first") {
        setSupabaseReadError(true);
      }
      setDiagnosisStatus(t("diagnosis.saveFailed"));
    } finally {
      if (isHouseholdOperationCurrent()) setIsSavingDiagnosis(false);
    }
  };

  const updateDiagnosticHistoryEntry = async (diagnosticId: string, patch: Partial<Pick<PlantDiagnosticEntry, "userConfirmation" | "userNote">>) => {
    if (!isHouseholdOperationCurrent()) return false;
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
        if (!isHouseholdOperationCurrent()) return false;
        await refreshSupabaseReadState();
      } catch (error) {
        if (!isHouseholdOperationCurrent()) return false;
        logTechnicalError("Supabase diagnosis update failed.", error);
        setDiagnosisStatus(t("diagnosis.updateFailed"));
        setDiagnosticHistoryStatus(t("diagnosis.updateFailed"));
        await refreshSupabaseReadState().catch((refreshError) => {
          logTechnicalError("Supabase diagnosis history refresh failed after update.", refreshError);
        });
        return false;
      }
    }

    return isHouseholdOperationCurrent();
  };

  const updateDiagnosticConfirmation = async (diagnosticId: string, userConfirmation: DiagnosisConfirmation) => {
    if (!isHouseholdOperationCurrent()) return;
    if (pendingDiagnosticUpdateKey) {
      return;
    }

    const updateKey = `${diagnosticId}:${userConfirmation}`;
    setPendingDiagnosticUpdateKey(updateKey);
    setDiagnosticHistoryStatus(t("diagnosis.saving"));

    try {
      const saved = await updateDiagnosticHistoryEntry(diagnosticId, { userConfirmation });
      if (!isHouseholdOperationCurrent()) return;
      setDiagnosticHistoryStatus(saved ? t("diagnosis.saved") : t("diagnosis.updateFailed"));
    } finally {
      if (isHouseholdOperationCurrent()) setPendingDiagnosticUpdateKey("");
    }
  };
  return { openDiagnosisModal, closeDiagnosisModal, handleDiagnosisImageChange, runPlantDiagnosis, upsertSupabaseDiagnosisInReadState, savePlantDiagnosis, updateDiagnosticHistoryEntry, updateDiagnosticConfirmation };
};
