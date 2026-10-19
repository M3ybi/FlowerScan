import {
  ArrowLeft,
  BadgeCheck,
  Camera,
  Check,
  Droplets,
  Leaf,
  Pencil,
  QrCodeIcon,
  Sparkles,
  Sprout,
  Trash2,
  X
} from "lucide-react";
import type { MouseEvent } from "react";
import { useEffect } from "react";
import {
  publicFlowerUrl,
  todayIsoDate
} from "../../../app/appFormatting";
import type { CarePreview } from "../../../app/carePresentation";
import {
  getCareDiffRows,
  getCarePillVisual
} from "../../../app/carePresentation";
import type { AppRoute } from "../../../app/routes";
import { AppTabNav } from "../../../components/AppNavigation";
import { LoadingButton } from "../../../components/LoadingButton";
import { ModalDialog } from "../../../components/ModalDialog";
import { QrCode } from "../../../components/QrCode";
import { UpgradeModal } from "../../../components/UpgradeModal";
import type { Flower } from "../../../data/flowers";
import { wateringIntervalsDays } from "../../../data/wateringIntervals";
import type { FlowerRecords } from "../../../hooks/useFlowerRecords";
import { useImageSelection } from "../../../hooks/useImageSelection";
import { useSubscriptionState } from "../../../hooks/useSubscriptionState";
import type { AiDiagnosisAccessResult } from "../../../lib/aiDiagnosisAccess";
import { createTranslator } from "../../../lib/i18n";
import type { ImageCaptureSource, ImagePickerLabels } from "../../../lib/imageCaptureService";
import type { PlantieLanguage } from "../../../lib/onboarding";
import type { SubscriptionSnapshot } from "../../../lib/subscriptionState";
import { daysSince } from "../../../utils/dates";
import type { DiagnosisConfirmation, PlantDiagnosisDraft, PlantDiagnosticEntry } from "../../../utils/diagnostics";
import { getWateringProgress } from "../../../utils/watering";
import { CarePreviewModal } from "../../care/components/CarePreviewModal";
import { DiagnosisModal } from "../../diagnosis/components/DiagnosisModal";
import { DiagnosticHistory } from "../../diagnosis/components/DiagnosticHistory";

type Props = {
  route: AppRoute;
  flowerById: Map<string, Flower>;
  renderHeroActions: () => JSX.Element;
  renderHouseholdSheet: () => JSX.Element | null;
  navigateBack: (fallbackHash?: string) => (event: MouseEvent<HTMLAnchorElement>) => void;
  t: ReturnType<typeof createTranslator>;
  records: FlowerRecords;
  baseUrl: string;
  carePreview: CarePreview | null;
  editingNameFlowerId: string;
  resolveCurrentAiDiagnosisAccess: () => AiDiagnosisAccessResult;
  aiDiagnosisAccessMessage: (access: AiDiagnosisAccessResult) => string;
  currentHouseholdPlanUsage: ReturnType<typeof useSubscriptionState>["subscription"]["householdPlanUsage"];
  freeAiDiagnosisMonthlyLimit: number;
  aiDiagnosisDisabledActionLabel: (access: AiDiagnosisAccessResult) => string;
  diagnostics: PlantDiagnosticEntry[];
  draftFlowerName: string;
  setDraftFlowerName: React.Dispatch<React.SetStateAction<string>>;
  confirmNameEdit: (flower: Flower) => void;
  cancelNameEdit: () => void;
  startNameEdit: (flower: Flower) => void;
  openAddPlantFromMobileNav: () => void;
  quickRecordStatus: string;
  saveQuickRecord: (actionKey: string, flowerId: string, patch: Partial<FlowerRecords[string]>, message: string) => Promise<void>;
  pendingQuickRecordKey: string;
  openDiagnosisModal: () => void;
  formatAppDate: (value: string) => string;
  formatAppElapsedDays: (value: number | null) => string;
  formatAppWateringStatus: (progress: ReturnType<typeof getWateringProgress>) => string;
  isGeneratingCarePreview: boolean;
  handleGenerateCarePreview: (flower: Flower) => Promise<void>;
  carePreviewStatus: string;
  updateCareRecord: (flowerId: string, patch: Partial<FlowerRecords[string]>, message?: string) => Promise<boolean>;
  diagnosticHistoryStatus: string;
  openDiagnosticId: string;
  localizedConfidenceLabel: (value: string) => string;
  setOpenDiagnosticId: React.Dispatch<React.SetStateAction<string>>;
  updateDiagnosticHistoryEntry: (diagnosticId: string, patch: Partial<Pick<PlantDiagnosticEntry, "userConfirmation" | "userNote">>) => Promise<boolean>;
  updateDiagnosticConfirmation: (diagnosticId: string, userConfirmation: DiagnosisConfirmation) => Promise<void>;
  pendingDiagnosticUpdateKey: string;
  selectedLanguage: PlantieLanguage | null;
  setDeleteFlowerId: React.Dispatch<React.SetStateAction<string>>;
  setCarePreview: React.Dispatch<React.SetStateAction<CarePreview | null>>;
  confirmCareUpdate: () => void;
  isApplyingCare: boolean;
  isDiagnosisModalOpen: boolean;
  isDiagnosing: boolean;
  isSavingDiagnosis: boolean;
  closeDiagnosisModal: () => void;
  diagnosisSymptomNotes: string;
  setDiagnosisSymptomNotes: React.Dispatch<React.SetStateAction<string>>;
  isCapturingDiagnosisImage: boolean;
  handleDiagnosisImageChange: (source: ImageCaptureSource, file?: File, pickerLabels?: ImagePickerLabels) => Promise<void>;
  diagnosisImageSelection: ReturnType<typeof useImageSelection>;
  diagnosisImageDataUrl: string;
  diagnosisImagePreviewUrl: string;
  diagnosisStatus: string;
  runPlantDiagnosis: (flower: Flower) => Promise<void>;
  diagnosisDraft: PlantDiagnosisDraft | null;
  diagnosisUserNote: string;
  setDiagnosisUserNote: React.Dispatch<React.SetStateAction<string>>;
  savePlantDiagnosis: (flower: Flower, userConfirmation: DiagnosisConfirmation) => Promise<void>;
  diagnosisUpgradeReason: string;
  setDiagnosisUpgradeReason: React.Dispatch<React.SetStateAction<string>>;
  subscription: ReturnType<typeof useSubscriptionState>["subscription"];
  refreshPlanAfterSubscription: () => Promise<SubscriptionSnapshot>;
  deleteFlowerId: string;
  confirmRemoveCustomFlower: () => Promise<void>;
  isRemovingPlant: boolean;
  isSavingPlantName: boolean;
  plantMutationStatus: string;
};

export const PlantDetailsPage = ({
  route,
  flowerById,
  renderHeroActions,
  renderHouseholdSheet,
  navigateBack,
  t,
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
  openAddPlantFromMobileNav,
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
  plantMutationStatus
}: Props) => {
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

  if (route.page === "detail") {
    const flower = flowerById.get(route.flowerId);
    if (!flower) {
      return (
        <main className="app-shell compact">
          {renderHeroActions()}
          {renderHouseholdSheet()}
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
                  disabled={isSavingPlantName}
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
                  disabled={!draftFlowerName.trim() || isSavingPlantName || isRemovingPlant}
                  aria-label={t("detail.saveName")}
                >
                  <Check size={18} aria-hidden="true" />
                </button>
                <button className="name-edit-action" type="button" disabled={isSavingPlantName} onClick={cancelNameEdit} aria-label={t("detail.cancelNameEdit")}>
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
            {plantMutationStatus && !deleteFlowerId ? <p className="report-status" role="status">{plantMutationStatus}</p> : null}
          </div>
          {renderHeroActions()}
        </header>

        <AppTabNav currentPage="plants" onAddPlant={openAddPlantFromMobileNav} t={t} />

        <img className="detail-photo" src={flower.image} alt={flower.displayName} />

        <section className="scan-action-panel" aria-labelledby="quick-action-title">
          <div>
            <span>{quickActionLabel}</span>
            <h2 id="quick-action-title">{t("detail.quickAction")}</h2>
            <p>{t("detail.quickActionBody")}</p>
            <div className={`quick-save-feedback ${quickRecordStatus ? "quick-save-feedback-visible" : ""}`} aria-live="polite">
              {quickRecordStatus ? (
                <>
                  <Check size={16} aria-hidden="true" />
                  {quickRecordStatus}
                </>
              ) : null}
            </div>
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

        <DiagnosticHistory
          t={t}
          flowerDiagnostics={flowerDiagnostics}
          diagnosticHistoryStatus={diagnosticHistoryStatus}
          openDiagnosticId={openDiagnosticId}
          localizedConfidenceLabel={localizedConfidenceLabel}
          setOpenDiagnosticId={setOpenDiagnosticId}
          updateDiagnosticHistoryEntry={updateDiagnosticHistoryEntry}
          updateDiagnosticConfirmation={updateDiagnosticConfirmation}
          pendingDiagnosticUpdateKey={pendingDiagnosticUpdateKey}
        />

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

        {<CarePreviewModal
          activeCarePreview={activeCarePreview}
          isApplyingCare={isApplyingCare}
          setCarePreview={setCarePreview}
          t={t}
          flower={flower}
          careDiffRows={careDiffRows}
          confirmCareUpdate={confirmCareUpdate}
        />}

        {<DiagnosisModal
          isDiagnosisModalOpen={isDiagnosisModalOpen}
          t={t}
          isDiagnosing={isDiagnosing}
          isSavingDiagnosis={isSavingDiagnosis}
          closeDiagnosisModal={closeDiagnosisModal}
          diagnosisUsageLabel={diagnosisUsageLabel}
          diagnosisBlockedReason={diagnosisBlockedReason}
          diagnosisSymptomNotes={diagnosisSymptomNotes}
          setDiagnosisSymptomNotes={setDiagnosisSymptomNotes}
          diagnosisAccess={diagnosisAccess}
          isCapturingDiagnosisImage={isCapturingDiagnosisImage}
          handleDiagnosisImageChange={handleDiagnosisImageChange}
          diagnosisImageSelection={diagnosisImageSelection}
          diagnosisImageDataUrl={diagnosisImageDataUrl}
          diagnosisImagePreviewUrl={diagnosisImagePreviewUrl}
          diagnosisStatus={diagnosisStatus}
          runPlantDiagnosis={runPlantDiagnosis}
          flower={flower}
          diagnosisRunLabel={diagnosisRunLabel}
          diagnosisDraft={diagnosisDraft}
          localizedConfidenceLabel={localizedConfidenceLabel}
          diagnosisUserNote={diagnosisUserNote}
          setDiagnosisUserNote={setDiagnosisUserNote}
          savePlantDiagnosis={savePlantDiagnosis}
        />}

        {diagnosisUpgradeReason ? (
          <UpgradeModal
            limitReason={diagnosisUpgradeReason}
            language={selectedLanguage}
            onClose={() => setDiagnosisUpgradeReason("")}
            subscription={subscription}
            onSubscriptionChanged={refreshPlanAfterSubscription}
          />
        ) : null}

        {deleteFlowerId === flower.id ? (
          <ModalDialog className="confirm-modal" labelledBy="delete-confirm-title" busy={isRemovingPlant} onClose={() => setDeleteFlowerId("")}>
            <div className="section-title danger-title">
              <Trash2 size={20} aria-hidden="true" />
              <h2 id="delete-confirm-title">{t("detail.deleteConfirmTitle")}</h2>
            </div>
            <p>{t("detail.deleteConfirmBody", { plant: flower.displayName })}</p>
            {plantMutationStatus ? <p className="report-status" role="status">{plantMutationStatus}</p> : null}
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
          </ModalDialog>
        ) : null}
        {renderHouseholdSheet()}
      </main>
    );
  }
  return null;
};
