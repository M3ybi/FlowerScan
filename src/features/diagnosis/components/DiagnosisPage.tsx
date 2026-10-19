import {
  ArrowLeft,
  ArrowRight,
  Camera,
  ChevronRight,
  Search,
  Sprout
} from "lucide-react";
import type { MouseEvent } from "react";
import {
  flowerDiagnosticsCount
} from "../../../app/localDiagnostics";
import type { AppRoute } from "../../../app/routes";
import { AppTabNav, MobileBottomNav } from "../../../components/AppNavigation";
import type { Flower } from "../../../data/flowers";
import { createTranslator } from "../../../lib/i18n";
import type { PlantDiagnosticEntry } from "../../../utils/diagnostics";
import { flowerPath } from "../../../utils/links";

type Props = {
  route: AppRoute;
  navigateBack: (fallbackHash?: string) => (event: MouseEvent<HTMLAnchorElement>) => void;
  t: ReturnType<typeof createTranslator>;
  renderHeroActions: () => JSX.Element;
  openAddPlantFromMobileNav: () => void;
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  filteredFlowers: Flower[];
  visibleFlowers: Flower[];
  diagnostics: PlantDiagnosticEntry[];
  allFlowers: Flower[];
  plantPageSize: 10;
  plantPage: number;
  setPlantPage: React.Dispatch<React.SetStateAction<number>>;
  plantPageCount: number;
  renderHouseholdSheet: () => JSX.Element | null;
};

export const DiagnosisPage = ({
  route,
  navigateBack,
  t,
  renderHeroActions,
  openAddPlantFromMobileNav,
  query,
  setQuery,
  filteredFlowers,
  visibleFlowers,
  diagnostics,
  allFlowers,
  plantPageSize,
  plantPage,
  setPlantPage,
  plantPageCount,
  renderHouseholdSheet
}: Props) => {
  if (route.page === "diagnose") {
    return (
      <main className="app-shell compact">
        <header className="topbar topbar-with-actions">
          <a className="icon-link" href="#/" onClick={navigateBack("#/")} aria-label={t("nav.back")}>
            <ArrowLeft size={22} aria-hidden="true" />
          </a>
          <div>
            <p className="eyebrow">{t("diagnosis.premiumReady")}</p>
            <h1>{t("diagnosis.heading")}</h1>
            <p className="topbar-copy">{t("diagnosis.headingBody")}</p>
          </div>
          {renderHeroActions()}
        </header>
        <AppTabNav currentPage="diagnose" onAddPlant={openAddPlantFromMobileNav} t={t} />
        <section className="toolbar diagnose-toolbar" aria-label={t("dashboard.search")}>
          <label className="search-field">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">{t("dashboard.search")}</span>
            <input
              type="search"
              placeholder={t("dashboard.search")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </section>
        <section className="diagnose-picker" aria-labelledby="diagnose-picker-title">
          <div className="section-title">
            <Camera size={18} aria-hidden="true" />
            <h2 id="diagnose-picker-title">{t("diagnosis.pick")}</h2>
          </div>
          <p>{t("diagnosis.pickBody")}</p>
          {filteredFlowers.length > 0 ? (
            <div className="diagnose-picker-list">
              {visibleFlowers.map((flower) => (
                <a className="diagnose-picker-card" href={flowerPath(flower.id, false, "diagnostics")} key={flower.id}>
                  <img src={flower.image} alt={flower.displayName} loading="lazy" />
                  <div>
                    <strong>{flower.displayName}</strong>
                    <span>{t("diagnosis.savedCount", { count: flowerDiagnosticsCount(flower.id, diagnostics) })}</span>
                  </div>
                  <ChevronRight className="diagnose-picker-open-icon" size={18} aria-hidden="true" />
                </a>
              ))}
            </div>
          ) : (
            <div className="empty-state empty-state-card">
              <Sprout size={34} aria-hidden="true" />
              <h2>{allFlowers.length > 0 ? t("dashboard.emptySearch") : t("diagnosis.empty")}</h2>
              <p>{allFlowers.length > 0 ? t("dashboard.emptySearchBody") : t("diagnosis.emptyBody")}</p>
              {allFlowers.length > 0 ? null : <a className="primary-action" href="#/">{t("qr.openDashboard")}</a>}
            </div>
          )}
        </section>
        {filteredFlowers.length > plantPageSize ? (
          <nav className="plant-pagination" aria-label="Plant pages">
            <button type="button" disabled={plantPage === 1} onClick={() => setPlantPage(1)} aria-label="First page">
              <ArrowLeft size={16} aria-hidden="true" />
              <ArrowLeft size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={plantPage === 1}
              onClick={() => setPlantPage((currentPage) => Math.max(1, currentPage - 1))}
              aria-label="Previous page"
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
            <span>
              {plantPage} / {plantPageCount}
            </span>
            <button
              type="button"
              disabled={plantPage === plantPageCount}
              onClick={() => setPlantPage((currentPage) => Math.min(plantPageCount, currentPage + 1))}
              aria-label="Next page"
            >
              <ArrowRight size={18} aria-hidden="true" />
            </button>
            <button type="button" disabled={plantPage === plantPageCount} onClick={() => setPlantPage(plantPageCount)} aria-label="Last page">
              <ArrowRight size={16} aria-hidden="true" />
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </nav>
        ) : null}
        {renderHouseholdSheet()}
        <MobileBottomNav currentPage="diagnose" onAddPlant={openAddPlantFromMobileNav} t={t} />
      </main>
    );
  }
  return null;
};
