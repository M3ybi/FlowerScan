import {
  Camera
} from "lucide-react";
import {
  riskLevelLabel
} from "../../../app/localDiagnostics";
import { ImageSourcePicker } from "../../../components/ImageSourcePicker";
import { LoadingButton } from "../../../components/LoadingButton";
import { PlantActionModal, PlantFormStatus, PlantImagePreview } from "../../../components/PlantActionModal";
import type { Flower } from "../../../data/flowers";
import type { AiDiagnosisAccessResult } from "../../../lib/aiDiagnosisAccess";
import { createTranslator } from "../../../lib/i18n";
import type { ImageCaptureSource, ImagePickerLabels, NormalizedImage } from "../../../lib/imageCaptureService";
import type { DiagnosisConfirmation, PlantDiagnosisDraft } from "../../../utils/diagnostics";

type Props = {
  isDiagnosisModalOpen: boolean;
  t: ReturnType<typeof createTranslator>;
  isDiagnosing: boolean;
  isSavingDiagnosis: boolean;
  closeDiagnosisModal: () => void;
  diagnosisUsageLabel: string;
  diagnosisBlockedReason: string;
  diagnosisSymptomNotes: string;
  setDiagnosisSymptomNotes: React.Dispatch<React.SetStateAction<string>>;
  diagnosisAccess: AiDiagnosisAccessResult;
  isCapturingDiagnosisImage: boolean;
  handleDiagnosisImageChange: (source: ImageCaptureSource, file?: File, pickerLabels?: ImagePickerLabels) => Promise<void>;
  diagnosisImageSelection: { image: NormalizedImage | null; isProcessing: boolean; select: (source: ImageCaptureSource, file?: File, pickerLabels?: ImagePickerLabels) => Promise<void>; cancel: () => void; clear: () => void; isBusy: () => boolean; };
  diagnosisImageDataUrl: string;
  diagnosisImagePreviewUrl: string;
  diagnosisStatus: string;
  runPlantDiagnosis: (flower: Flower) => Promise<void>;
  flower: Flower;
  diagnosisRunLabel: string;
  diagnosisDraft: PlantDiagnosisDraft | null;
  localizedConfidenceLabel: (value: string) => string;
  diagnosisUserNote: string;
  setDiagnosisUserNote: React.Dispatch<React.SetStateAction<string>>;
  savePlantDiagnosis: (flower: Flower, userConfirmation: DiagnosisConfirmation) => Promise<void>;
};

export const DiagnosisModal = ({
  isDiagnosisModalOpen,
  t,
  isDiagnosing,
  isSavingDiagnosis,
  closeDiagnosisModal,
  diagnosisUsageLabel,
  diagnosisBlockedReason,
  diagnosisSymptomNotes,
  setDiagnosisSymptomNotes,
  diagnosisAccess,
  isCapturingDiagnosisImage,
  handleDiagnosisImageChange,
  diagnosisImageSelection,
  diagnosisImageDataUrl,
  diagnosisImagePreviewUrl,
  diagnosisStatus,
  runPlantDiagnosis,
  flower,
  diagnosisRunLabel,
  diagnosisDraft,
  localizedConfidenceLabel,
  diagnosisUserNote,
  setDiagnosisUserNote,
  savePlantDiagnosis
}: Props) => (
  isDiagnosisModalOpen ? (
    <PlantActionModal id="diagnosis-modal" title={t("detail.diagnosisAction")} description={t("diagnosis.modalBody")}
      icon={<Camera size={20} aria-hidden="true" />} closeLabel={t("action.close")}
      busy={isDiagnosing || isSavingDiagnosis} onClose={closeDiagnosisModal}>
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

      <ImageSourcePicker
        title={t("diagnosis.photoPrompt")} help={t("diagnosis.photoHelp")}
        cameraLabel={t("action.camera")} galleryLabel={t("action.gallery")} cancelLabel={t("action.cancel")}
        disabled={!diagnosisAccess.allowed || isDiagnosing} busy={isCapturingDiagnosisImage}
        onSelect={handleDiagnosisImageChange}
        onCancel={diagnosisImageSelection.cancel}
      />

      {diagnosisImageDataUrl ? <PlantImagePreview src={diagnosisImagePreviewUrl || diagnosisImageDataUrl} alt={t("diagnosis.previewAlt")} /> : null}
      <PlantFormStatus>{diagnosisStatus}</PlantFormStatus>

      <LoadingButton
        className="primary-action diagnosis-run-button"
        type="button"
        disabled={!diagnosisImageDataUrl || isDiagnosing || isCapturingDiagnosisImage || !diagnosisAccess.allowed}
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
              {t("diagnosis.confidence", {
                percent: diagnosisDraft.confidence,
                label: localizedConfidenceLabel(diagnosisDraft.confidenceLabel),
              })}
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
    </PlantActionModal>
  ) : null
);
