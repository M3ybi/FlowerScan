import {
  ArrowLeft,
  FileDown,
  Printer,
  QrCodeIcon
} from "lucide-react";
import type { MouseEvent } from "react";
import {
  publicFlowerUrl
} from "../../../app/appFormatting";
import type { AppRoute } from "../../../app/routes";
import { AppTabNav, MobileBottomNav } from "../../../components/AppNavigation";
import { LoadingButton } from "../../../components/LoadingButton";
import { QrCode } from "../../../components/QrCode";
import type { Flower } from "../../../data/flowers";
import { createTranslator } from "../../../lib/i18n";
import type { PlantieLanguage } from "../../../lib/onboarding";
import { qrLabelSpec } from "../../../utils/qrPdf";

type Props = {
  route: AppRoute;
  navigateBack: (fallbackHash?: string) => (event: MouseEvent<HTMLAnchorElement>) => void;
  t: ReturnType<typeof createTranslator>;
  handleQrPdfExport: () => Promise<void>;
  isExportingQrPdf: boolean;
  renderHeroActions: () => JSX.Element;
  openAddPlantFromMobileNav: () => void;
  baseUrl: string;
  setBaseUrl: React.Dispatch<React.SetStateAction<string>>;
  allFlowers: Flower[];
  qrLabelValidation: { isValid: boolean; message: string; };
  qrExportStatus: string;
  selectedLanguage: PlantieLanguage | null;
  renderHouseholdSheet: () => JSX.Element | null;
};

export const QrPage = ({
  route,
  navigateBack,
  t,
  handleQrPdfExport,
  isExportingQrPdf,
  renderHeroActions,
  openAddPlantFromMobileNav,
  baseUrl,
  setBaseUrl,
  allFlowers,
  qrLabelValidation,
  qrExportStatus,
  selectedLanguage,
  renderHouseholdSheet
}: Props) => {
  if (route.page === "qr") {
    return (
      <main className="app-shell qr-shell">
        <header className="topbar qr-header">
          <div className="qr-header-title">
            <a className="icon-link" href="#/" onClick={navigateBack("#/")} aria-label={t("nav.back")}>
              <ArrowLeft size={22} aria-hidden="true" />
            </a>
            <div>
              <p className="eyebrow">{t("qr.printable")}</p>
              <h1>{t("qr.heading")}</h1>
            </div>
          </div>
          <p className="topbar-copy qr-header-copy">{t("qr.body")}</p>
          <div className="qr-header-actions">
            <LoadingButton
              className="primary-action qr-header-action"
              type="button"
              onClick={handleQrPdfExport}
              disabled={allFlowers.length === 0}
              aria-label={isExportingQrPdf ? t("qr.exportGenerating") : undefined}
              isLoading={isExportingQrPdf}
            >
              <FileDown size={18} aria-hidden="true" />
              <span>{t("qr.exportPdf")}</span>
            </LoadingButton>
            <button className="ghost-action qr-header-action" type="button" onClick={() => window.print()} disabled={allFlowers.length === 0}>
              <Printer size={18} aria-hidden="true" />
              <span>{t("qr.printCodes")}</span>
            </button>
          </div>
          <div className="qr-header-household">
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
              {qrExportStatus ? <div className="report-status" role="status">{qrExportStatus}</div> : null}
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
  return null;
};
