import { Camera, Home, Leaf, Plus, QrCodeIcon } from "lucide-react";
import type { createTranslator } from "../lib/i18n";

export type AppNavigationPage = "plants" | "diagnose" | "add" | "qr" | "menu";

type AppNavigationProps = {
  currentPage: AppNavigationPage;
  onAddPlant: () => void;
  t: ReturnType<typeof createTranslator>;
};

export const MobileBottomNav = ({ currentPage, onAddPlant, t }: AppNavigationProps) => (
  <nav className="mobile-bottom-nav" aria-label={t("nav.mobile")}>
    <a aria-current={currentPage === "plants" ? "page" : undefined} className={currentPage === "plants" ? "active" : ""} href="#/">
      <Leaf size={22} aria-hidden="true" />
      <span className="mobile-nav-label">{t("nav.plants")}</span>
    </a>
    <a aria-label={t("nav.diagnose")} aria-current={currentPage === "diagnose" ? "page" : undefined} className={currentPage === "diagnose" ? "active" : ""} href="#/diagnose">
      <Camera size={22} aria-hidden="true" />
      <span className="mobile-nav-label">{t("nav.mobileDiagnose")}</span>
    </a>
    <button type="button" className="mobile-bottom-nav-action" onClick={onAddPlant} aria-label={t("dashboard.addPlant")}>
      <Plus size={22} aria-hidden="true" />
      <span className="mobile-nav-label">{t("nav.mobileAddPlant")}</span>
    </button>
    <a aria-current={currentPage === "qr" ? "page" : undefined} className={currentPage === "qr" ? "active" : ""} href="#/qr">
      <QrCodeIcon size={22} aria-hidden="true" />
      <span className="mobile-nav-label">{t("nav.qr")}</span>
    </a>
    <a aria-current={currentPage === "menu" ? "page" : undefined} className={currentPage === "menu" ? "active" : ""} href="#/menu">
      <Home size={22} aria-hidden="true" />
      <span className="mobile-nav-label">{t("nav.mobileMenu")}</span>
    </a>
  </nav>
);

export const AppTabNav = ({ currentPage, onAddPlant, t }: AppNavigationProps) => (
  <nav className="app-tab-nav" aria-label="Main navigation">
    <a aria-current={currentPage === "plants" ? "page" : undefined} className={currentPage === "plants" ? "active" : ""} href="#/">
      <Leaf size={18} aria-hidden="true" />
      {t("nav.plants")}
    </a>
    <a aria-current={currentPage === "diagnose" ? "page" : undefined} className={currentPage === "diagnose" ? "active" : ""} href="#/diagnose">
      <Camera size={18} aria-hidden="true" />
      {t("nav.diagnose")}
    </a>
    <button type="button" className={currentPage === "add" ? "active app-tab-nav-action" : "app-tab-nav-action"} onClick={onAddPlant}>
      <Plus size={18} aria-hidden="true" />
      {t("dashboard.addPlant")}
    </button>
    <a aria-current={currentPage === "qr" ? "page" : undefined} className={currentPage === "qr" ? "active" : ""} href="#/qr">
      <QrCodeIcon size={18} aria-hidden="true" />
      {t("nav.qr")}
    </a>
    <a aria-current={currentPage === "menu" ? "page" : undefined} className={currentPage === "menu" ? "active" : ""} href="#/menu">
      <Home size={18} aria-hidden="true" />
      {t("nav.menu")}
    </a>
  </nav>
);
