import { useRef, useState } from "react";
import type { CarePreview } from "../../../app/carePresentation";
import {
  applyGeneratedCareToFlower
} from "../../../app/carePresentation";
import type { Flower } from "../../../data/flowers";
import { useAuth } from "../../../hooks/useAuth";
import type { AiDiagnosisAccessResult } from "../../../lib/aiDiagnosisAccess";
import { createTranslator } from "../../../lib/i18n";
import { imageErrorMessage } from "../../../lib/imageUploadErrors";
import type { PlantieLanguage } from "../../../lib/onboarding";
import {
  getHouseholdPlantById,
  getPlantImageSignedUrl
} from "../../../lib/plantieRepository";
import {
  fetchGeneratedCare,
  imageSourceToDataUrl
} from "../../../utils/customFlower";

type Dependencies = {
  isHouseholdOperationCurrent: (started?: { userId: string | null; householdToken: string | null; generation: number; }) => boolean;
  isGeneratingCarePreview: boolean;
  resolveCurrentAiDiagnosisAccess: () => AiDiagnosisAccessResult;
  setCarePreviewStatus: React.Dispatch<React.SetStateAction<string>>;
  aiDiagnosisAccessMessage: (access: AiDiagnosisAccessResult) => string;
  setIsGeneratingCarePreview: React.Dispatch<React.SetStateAction<boolean>>;
  t: ReturnType<typeof createTranslator>;
  supabasePlantIdsByLegacyId: Record<string, string>;
  auth: ReturnType<typeof useAuth>;
  activeSupabaseHouseholdId: string;
  selectedLanguage: PlantieLanguage | null;
  setCarePreview: React.Dispatch<React.SetStateAction<CarePreview | null>>;
  carePreview: CarePreview | null;
  flowerById: Map<string, Flower>;
  saveFlower: (flower: Flower, message?: string) => Promise<boolean>;
};

export const useCareActions = ({
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
  saveFlower
}: Dependencies) => {
  const applyingRef = useRef(false);
  const [isApplyingCare, setIsApplyingCare] = useState(false);
  const handleGenerateCarePreview = async (flower: Flower) => {
    if (!isHouseholdOperationCurrent()) return;
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
      let imageSource = flower.image;
      if (supabasePlantId) {
        const plant = await getHouseholdPlantById(supabasePlantId);
        if (!isHouseholdOperationCurrent()) return;
        if (plant.imagePath) {
          imageSource = await getPlantImageSignedUrl(plant.imagePath);
        }
      }
      const imageDataUrl = await imageSourceToDataUrl(imageSource);
      if (!isHouseholdOperationCurrent()) return;
      const nextCare = await fetchGeneratedCare(flower.displayName, imageDataUrl, {
        generationSource: "manual_refresh",
        householdId: activeSupabaseHouseholdId,
        language: selectedLanguage,
        plantId: supabasePlantId,
      });
      if (!isHouseholdOperationCurrent()) return;
      setCarePreview({ flowerId: flower.id, nextCare });
      setCarePreviewStatus("");
    } catch (error) {
      if (!isHouseholdOperationCurrent()) return;
      const reason = error instanceof Error ? error.message : t("detail.aiCareFailed");
      setCarePreviewStatus(imageErrorMessage(error, selectedLanguage) ?? t("detail.aiGenerationFailed", { reason }));
    } finally {
      if (isHouseholdOperationCurrent()) setIsGeneratingCarePreview(false);
    }
  };

  const confirmCareUpdate = async () => {
    if (!carePreview || applyingRef.current || !isHouseholdOperationCurrent()) {
      return;
    }

    const currentFlower = flowerById.get(carePreview.flowerId);
    if (!currentFlower) {
      setCarePreview(null);
      setCarePreviewStatus(t("detail.plantUnavailable"));
      return;
    }

    applyingRef.current = true;
    setIsApplyingCare(true);
    try {
      const saved = await saveFlower(applyGeneratedCareToFlower(currentFlower, carePreview.nextCare), t("detail.careUpdated"));
      if (!isHouseholdOperationCurrent()) return;
      if (saved) {
        setCarePreview(null);
        setCarePreviewStatus(t("detail.careUpdated"));
      } else {
        setCarePreviewStatus(t("sync.householdUnavailable"));
      }
    } catch {
      if (isHouseholdOperationCurrent()) setCarePreviewStatus(t("sync.householdUnavailable"));
    } finally {
      applyingRef.current = false;
      setIsApplyingCare(false);
    }
  };
  return { handleGenerateCarePreview, confirmCareUpdate, isApplyingCare };
};
