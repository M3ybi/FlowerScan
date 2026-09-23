import { Camera, Home, Leaf, Plus, QrCodeIcon } from "lucide-react";
import type { createTranslator } from "../lib/i18n";

export type AppNavigationPage = "plants" | "diagnose" | "add" | "qr" | "menu";

type AppNavigationProps = {
  currentPage: AppNavigationPage;
  onAddPlant: () => void;
  t: ReturnType<typeof createTranslator>;
};

export const MobileBottomNav = ({ currentPage, onAddPlant, t }: AppNavigationProps) => (
  <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
    <a className={currentPage === "plants" ? "active" : ""} href="#/">
      <Leaf size={18} aria-hidden="true" />
      {t("nav.plants")}
    </a>
    <a className={currentPage === "diagnose" ? "active" : ""} href="#/diagnose">
      <Camera size={18} aria-hidden="true" />
      {t("nav.diagnose")}
    </a>
    <button type="button" className="mobile-bottom-nav-action" onClick={onAddPlant}>
      <Plus size={18} aria-hidden="true" />
      {t("dashboard.addPlant")}
    </button>
    <a className={currentPage === "qr" ? "active" : ""} href="#/qr">
      <QrCodeIcon size={18} aria-hidden="true" />
      {t("nav.qr")}
    </a>
    <a className={currentPage === "menu" ? "active" : ""} href="#/menu">
      <Home size={18} aria-hidden="true" />
      {t("nav.menu")}
    </a>
  </nav>
);

export const AppTabNav = ({ currentPage, onAddPlant, t }: AppNavigationProps) => (
  <nav className="app-tab-nav" aria-label="Main navigation">
    <a className={currentPage === "plants" ? "active" : ""} href="#/">
      <Leaf size={18} aria-hidden="true" />
      {t("nav.plants")}
    </a>
    <a className={currentPage === "diagnose" ? "active" : ""} href="#/diagnose">
      <Camera size={18} aria-hidden="true" />
      {t("nav.diagnose")}
    </a>
    <button type="button" className={currentPage === "add" ? "active app-tab-nav-action" : "app-tab-nav-action"} onClick={onAddPlant}>
      <Plus size={18} aria-hidden="true" />
      {t("dashboard.addPlant")}
    </button>
    <a className={currentPage === "qr" ? "active" : ""} href="#/qr">
      <QrCodeIcon size={18} aria-hidden="true" />
      {t("nav.qr")}
    </a>
    <a className={currentPage === "menu" ? "active" : ""} href="#/menu">
      <Home size={18} aria-hidden="true" />
      {t("nav.menu")}
    </a>
  </nav>
);
