import {
  Camera
} from "lucide-react";
import {
  riskLevelLabel
} from "../../../app/localDiagnostics";
import { LoadingButton } from "../../../components/LoadingButton";
import { createTranslator } from "../../../lib/i18n";
import { formatDate } from "../../../utils/dates";
import type { DiagnosisConfirmation, PlantDiagnosticEntry } from "../../../utils/diagnostics";

type Props = {
  t: ReturnType<typeof createTranslator>;
  flowerDiagnostics: PlantDiagnosticEntry[];
  diagnosticHistoryStatus: string;
  openDiagnosticId: string;
  localizedConfidenceLabel: (value: string) => string;
  setOpenDiagnosticId: React.Dispatch<React.SetStateAction<string>>;
  updateDiagnosticHistoryEntry: (diagnosticId: string, patch: Partial<Pick<PlantDiagnosticEntry, "userConfirmation" | "userNote">>) => Promise<boolean>;
  updateDiagnosticConfirmation: (diagnosticId: string, userConfirmation: DiagnosisConfirmation) => Promise<void>;
  pendingDiagnosticUpdateKey: string;
};

export const DiagnosticHistory = ({
  t,
  flowerDiagnostics,
  diagnosticHistoryStatus,
  openDiagnosticId,
  localizedConfidenceLabel,
  setOpenDiagnosticId,
  updateDiagnosticHistoryEntry,
  updateDiagnosticConfirmation,
  pendingDiagnosticUpdateKey
}: Props) => (
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
                    <span>{localizedConfidenceLabel(diagnosis.confidenceLabel)}</span>
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
);
