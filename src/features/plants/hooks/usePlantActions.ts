import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { AppRoute } from "../../../app/routes";
import type { Flower } from "../../../data/flowers";
import { useImageSelection } from "../../../hooks/useImageSelection";
import type { HouseholdPlanUsage } from "../../../lib/householdPlanService";
import {
  assertCanAddPlant,
} from "../../../lib/householdPlanService";
import { createTranslator } from "../../../lib/i18n";
import type { NormalizedImage } from "../../../lib/imageCaptureService";
import { imageErrorMessage } from "../../../lib/imageUploadErrors";
import type { PlantieLanguage } from "../../../lib/onboarding";
import {
  PlantImageUploadError
} from "../../../lib/supabaseSourceOfTruth";
import {
  createCustomFlowerId,
  fetchGeneratedCare
} from "../../../utils/customFlower";
import { addPlantFromPhoto } from "../services/addPlant";

type Dependencies = {
  scopeKey: string;
  isHouseholdOperationCurrent: (started?: { userId: string | null; householdToken: string | null; generation: number; }) => boolean;
  plantSubmissionRef: React.MutableRefObject<symbol | null>;
  newImageSelection: ReturnType<typeof useImageSelection>;
  newPlantName: string;
  newPlantImage: NormalizedImage | null;
  setNewPlantStatus: React.Dispatch<React.SetStateAction<string>>;
  t: ReturnType<typeof createTranslator>;
  setIsAddingPlant: React.Dispatch<React.SetStateAction<boolean>>;
  pendingPlantIdRef: React.MutableRefObject<string | null>;
  activeSupabaseHouseholdId: string;
  selectedLanguage: PlantieLanguage | null;
  addFlower: (flower: Flower) => Promise<boolean>;
  refreshHouseholdPlanUsage: () => Promise<HouseholdPlanUsage | null>;
  setNewPlantName: React.Dispatch<React.SetStateAction<string>>;
  setIsAddPlantModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setEditingNameFlowerId: React.Dispatch<React.SetStateAction<string>>;
  setDraftFlowerName: React.Dispatch<React.SetStateAction<string>>;
  draftFlowerName: string;
  saveFlower: (flower: Flower, message?: string) => Promise<boolean>;
  deleteFlowerId: string;
  isRemovingPlant: boolean;
  setIsRemovingPlant: React.Dispatch<React.SetStateAction<boolean>>;
  removeFlowerById: (flowerId: string) => Promise<boolean>;
  setDeleteFlowerId: React.Dispatch<React.SetStateAction<string>>;
  route: AppRoute;
};

export const usePlantActions = ({
  scopeKey,
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
  route
}: Dependencies) => {
  const mutation = useRef<symbol | null>(null);
  const [isSavingPlantName, setIsSavingPlantName] = useState(false);
  const [plantMutationStatus, setPlantMutationStatus] = useState("");
  useEffect(() => { mutation.current = null; setIsSavingPlantName(false); setPlantMutationStatus(""); }, [scopeKey]);
  const handleAddCustomFlower = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isHouseholdOperationCurrent()) return;
    if (plantSubmissionRef.current || newImageSelection.isBusy()) {
      return;
    }

    const plantName = newPlantName.trim();

    if (!plantName || !newPlantImage) {
      setNewPlantStatus(t("plantForm.nameAndImageRequired"));
      return;
    }

    const submission = Symbol("plant-submission");
    plantSubmissionRef.current = submission;
    let savingPlant = false;
    setIsAddingPlant(true);
    setNewPlantStatus(t("image.validatingSafety"));

    try {
      const customFlower = await addPlantFromPhoto({
        name: plantName, imageDataUrl: newPlantImage.dataUrl,
        id: pendingPlantIdRef.current ?? (pendingPlantIdRef.current = createCustomFlowerId()),
        householdId: activeSupabaseHouseholdId, language: selectedLanguage,
      }, {
        assertCanAdd: assertCanAddPlant, generateCare: fetchGeneratedCare, save: addFlower,
        refreshUsage: refreshHouseholdPlanUsage, isCurrent: isHouseholdOperationCurrent,
        onStage: stage => {
          savingPlant = stage === "saving";
          setNewPlantStatus(t(stage === "checking" ? "image.validatingSafety" : stage === "generating" ? "plantForm.generatingCare" : "image.uploading"));
        },
      });
      if (!customFlower || !isHouseholdOperationCurrent()) return;
      setNewPlantStatus(t("plantForm.added", { plant: customFlower.displayName }));
      pendingPlantIdRef.current = null;
      setNewPlantName("");
      newImageSelection.clear();
      setIsAddPlantModalOpen(false);
    } catch (error) {
      if (!isHouseholdOperationCurrent()) return;
      setNewPlantStatus(imageErrorMessage(error, selectedLanguage) ?? (error instanceof PlantImageUploadError ? t("plantForm.uploadFailed")
        : savingPlant ? t("plantForm.saveFailed") : t("plantForm.aiFailed", { reason: "" })));
    } finally {
      if (plantSubmissionRef.current === submission) plantSubmissionRef.current = null;
      if (isHouseholdOperationCurrent()) setIsAddingPlant(false);
    }
  };

  const startNameEdit = (flower: Flower) => {
    setPlantMutationStatus("");
    setEditingNameFlowerId(flower.id);
    setDraftFlowerName(flower.displayName);
  };

  const cancelNameEdit = () => {
    setEditingNameFlowerId("");
    setDraftFlowerName("");
  };

  const confirmNameEdit = async (flower: Flower) => {
    const nextName = draftFlowerName.trim();
    if (!nextName || mutation.current || !isHouseholdOperationCurrent()) {
      return;
    }

    const token = Symbol("rename-plant");
    mutation.current = token;
    setIsSavingPlantName(true);
    setPlantMutationStatus("");
    try {
      const saved = await saveFlower({ ...flower, displayName: nextName, source: "custom" });
      if (!isHouseholdOperationCurrent()) return;
      if (saved) cancelNameEdit();
      else setPlantMutationStatus(t("sync.plantUnavailable"));
    } catch {
      if (isHouseholdOperationCurrent()) setPlantMutationStatus(t("sync.plantUnavailable"));
    } finally {
      if (mutation.current === token) mutation.current = null;
      if (isHouseholdOperationCurrent()) setIsSavingPlantName(false);
    }
  };

  const confirmRemoveCustomFlower = async () => {
    if (!isHouseholdOperationCurrent()) return;
    if (!deleteFlowerId || isRemovingPlant || mutation.current) {
      return;
    }

    const token = Symbol("remove-plant");
    mutation.current = token;
    setPlantMutationStatus("");
    try {
      setIsRemovingPlant(true);
      const removed = await removeFlowerById(deleteFlowerId);
      if (!isHouseholdOperationCurrent()) return;
      if (!removed) { setPlantMutationStatus(t("sync.removeUnavailable")); return; }
      setDeleteFlowerId("");
      window.location.hash = "#/";
    } catch {
      if (isHouseholdOperationCurrent()) setPlantMutationStatus(t("sync.removeUnavailable"));
    } finally {
      if (mutation.current === token) mutation.current = null;
      if (isHouseholdOperationCurrent()) setIsRemovingPlant(false);
    }
  };

  const openAddPlantModal = () => {
    setNewPlantStatus("");
    setIsAddPlantModalOpen(true);
  };

  const closeAddPlantModal = () => {
    if (plantSubmissionRef.current) return;
    newImageSelection.cancel();
    setNewPlantStatus("");
    setIsAddPlantModalOpen(false);
  };

  const openAddPlantFromMobileNav = () => {
    openAddPlantModal();
    if (route.page !== "dashboard") {
      window.location.hash = "#/";
    }
  };
  return { startNameEdit, cancelNameEdit, confirmNameEdit, confirmRemoveCustomFlower, handleAddCustomFlower, openAddPlantModal, closeAddPlantModal, openAddPlantFromMobileNav, isSavingPlantName, plantMutationStatus };
};
