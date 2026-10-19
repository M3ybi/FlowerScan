import {
  BadgeCheck,
  Sparkles,
  X
} from "lucide-react";
import type { CareDiffRow, CarePreview } from "../../../app/carePresentation";
import { LoadingButton } from "../../../components/LoadingButton";
import { ModalDialog } from "../../../components/ModalDialog";
import type { Flower } from "../../../data/flowers";
import { createTranslator } from "../../../lib/i18n";

type Props = {
  activeCarePreview: CarePreview | null;
  isApplyingCare: boolean;
  setCarePreview: React.Dispatch<React.SetStateAction<CarePreview | null>>;
  t: ReturnType<typeof createTranslator>;
  flower: Flower;
  careDiffRows: CareDiffRow[];
  confirmCareUpdate: () => void;
};

export const CarePreviewModal = ({
  activeCarePreview,
  isApplyingCare,
  setCarePreview,
  t,
  flower,
  careDiffRows,
  confirmCareUpdate
}: Props) => (
  activeCarePreview ? (
    <ModalDialog className="care-preview-modal" labelledBy="care-preview-title" busy={isApplyingCare} onClose={() => setCarePreview(null)}>
      <button className="modal-close" type="button" disabled={isApplyingCare} onClick={() => setCarePreview(null)} aria-label={t("action.close")}>
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
        <LoadingButton className="primary-action" type="button" onClick={confirmCareUpdate} disabled={careDiffRows.length === 0} isLoading={isApplyingCare} loadingLabel={t("detail.savingCare")}>
          {t("detail.applyCare")}
        </LoadingButton>
        <button className="neutral-action" type="button" disabled={isApplyingCare} onClick={() => setCarePreview(null)}>
          {t("action.no")}
        </button>
      </div>
    </ModalDialog>
  ) : null
);
