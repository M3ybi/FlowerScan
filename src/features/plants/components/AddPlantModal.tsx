import { Plus } from "lucide-react";
import type { FormEvent } from "react";
import { ImageSourcePicker } from "../../../components/ImageSourcePicker";
import { LoadingButton } from "../../../components/LoadingButton";
import { PlantActionModal, PlantImagePreview, PlantFormStatus } from "../../../components/PlantActionModal";
import type { useImageSelection } from "../../../hooks/useImageSelection";
import type { createTranslator } from "../../../lib/i18n";

type Props = {
  t: ReturnType<typeof createTranslator>;
  newPlantName: string;
  setNewPlantName: (value: string) => void;
  newPlantStatus: string;
  isAddingPlant: boolean;
  plantLimitReached: boolean;
  newImageSelection: ReturnType<typeof useImageSelection>;
  handleAddCustomFlower: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  closeAddPlantModal: () => void;
};
export const AddPlantModal = ({ t, newPlantName, setNewPlantName, newPlantStatus, isAddingPlant, plantLimitReached, newImageSelection, handleAddCustomFlower, closeAddPlantModal }: Props) => {
  const newPlantImage = newImageSelection.image;
  const isCapturingNewPlantImage = newImageSelection.isProcessing;
  return (
        <PlantActionModal id="add-plant" title={t("plantForm.title")} description={t("plantForm.body")}
          icon={<Plus size={20} aria-hidden="true" />} closeLabel={t("action.close")} busy={isAddingPlant} onClose={closeAddPlantModal}>
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
              <div className="field">
                <span>{t("plantForm.image")}</span>
                <ImageSourcePicker
                  title={t("plantForm.choosePhoto")}
                  help={newPlantImage ? t("plantForm.photoReady") : t("plantForm.photoHelp")}
                  cameraLabel={t("action.camera")} galleryLabel={t("action.gallery")} cancelLabel={t("action.cancel")}
                  disabled={isAddingPlant} busy={isCapturingNewPlantImage}
                  onSelect={newImageSelection.select}
                  onCancel={newImageSelection.cancel}
                />
                {newPlantImage ? <PlantImagePreview src={newPlantImage.previewUrl} alt={t("plantForm.previewAlt")} /> : null}
              </div>
              <LoadingButton className="primary-action" type="submit" disabled={plantLimitReached || isCapturingNewPlantImage} isLoading={isAddingPlant} loadingLabel={t("plantForm.adding")}>
                <Plus size={18} aria-hidden="true" />
                {t("dashboard.addPlant")}
              </LoadingButton>
            </form>
            <PlantFormStatus>{newPlantStatus}</PlantFormStatus>
        </PlantActionModal>
  );
};
