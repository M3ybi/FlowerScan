import {
  FileDown,
  Home,
  Plus,
  QrCodeIcon,
  Search,
  Sprout
} from "lucide-react";
import type { FormEvent } from "react";
import { AppTabNav, MobileBottomNav } from "../../../components/AppNavigation";
import type { Flower } from "../../../data/flowers";
import type { FlowerRecords } from "../../../hooks/useFlowerRecords";
import { useImageSelection } from "../../../hooks/useImageSelection";
import { createTranslator } from "../../../lib/i18n";
import { getWateringProgress } from "../../../utils/watering";
import { AddPlantModal } from "../../plants/components/AddPlantModal";
import { PlantGrid } from "../../plants/components/PlantGrid";

type Props = {
  t: ReturnType<typeof createTranslator>;
  allFlowers: Flower[];
  renderHeroActions: () => JSX.Element;
  isAddPlantModalOpen: boolean;
  openAddPlantFromMobileNav: () => void;
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  renderHouseholdSheet: () => JSX.Element | null;
  newPlantName: string;
  setNewPlantName: React.Dispatch<React.SetStateAction<string>>;
  newPlantStatus: string;
  isAddingPlant: boolean;
  plantLimitReached: boolean;
  newImageSelection: ReturnType<typeof useImageSelection>;
  handleAddCustomFlower: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  closeAddPlantModal: () => void;
  isNewOnboardingHousehold: boolean;
  customFlowers: Flower[];
  openAddPlantModal: () => void;
  visibleFlowers: Flower[];
  records: FlowerRecords;
  formatAppWateringStatus: (progress: ReturnType<typeof getWateringProgress>) => string;
  updateCareRecord: (flowerId: string, patch: Partial<FlowerRecords[string]>, message?: string) => Promise<boolean>;
  filteredFlowers: Flower[];
  plantPageSize: 10;
  plantPage: number;
  setPlantPage: React.Dispatch<React.SetStateAction<number>>;
  plantPageCount: number;
};

export const DashboardPage = ({
  t,
  allFlowers,
  renderHeroActions,
  isAddPlantModalOpen,
  openAddPlantFromMobileNav,
  query,
  setQuery,
  renderHouseholdSheet,
  newPlantName,
  setNewPlantName,
  newPlantStatus,
  isAddingPlant,
  plantLimitReached,
  newImageSelection,
  handleAddCustomFlower,
  closeAddPlantModal,
  isNewOnboardingHousehold,
  customFlowers,
  openAddPlantModal,
  visibleFlowers,
  records,
  formatAppWateringStatus,
  updateCareRecord,
  filteredFlowers,
  plantPageSize,
  plantPage,
  setPlantPage,
  plantPageCount
}: Props) => {
  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">{t("dashboard.tracked", { count: allFlowers.length })}</p>
          <h1>{t("dashboard.hero")}</h1>
          <p className="hero-copy">{t("dashboard.heroBody")}</p>
        </div>
        {renderHeroActions()}
      </header>
      <AppTabNav currentPage={isAddPlantModalOpen ? "add" : "plants"} onAddPlant={openAddPlantFromMobileNav} t={t} />
      <section className="toolbar" aria-label={t("dashboard.tools")}>
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

      {renderHouseholdSheet()}

      {isAddPlantModalOpen ? (
        <AddPlantModal t={t} newPlantName={newPlantName} setNewPlantName={setNewPlantName}
          newPlantStatus={newPlantStatus} isAddingPlant={isAddingPlant} plantLimitReached={plantLimitReached}
          newImageSelection={newImageSelection} handleAddCustomFlower={handleAddCustomFlower} closeAddPlantModal={closeAddPlantModal} />
      ) : null}

      {isNewOnboardingHousehold && customFlowers.length === 0 ? (
        <section className="empty-state onboarding-empty-dashboard" aria-labelledby="empty-dashboard-title">
          <Sprout size={36} aria-hidden="true" />
          <h2 id="empty-dashboard-title">{t("household.ready")}</h2>
          <p>{t("household.readyBody")}</p>
          <div className="onboarding-empty-actions">
            <button className="primary-action" type="button" onClick={openAddPlantModal}>
              <Plus size={18} aria-hidden="true" />
              {t("plantForm.addFirst")}
            </button>
            <a className="neutral-action" href="#/qr">
              <QrCodeIcon size={18} aria-hidden="true" />
              {t("qr.scan")}
            </a>
            <a className="neutral-action" href="#/menu">
              <FileDown size={18} aria-hidden="true" />
              {t("menu.open")}
            </a>
          </div>
        </section>
      ) : (
        <PlantGrid t={t} visibleFlowers={visibleFlowers} records={records}
          formatAppWateringStatus={formatAppWateringStatus} updateCareRecord={updateCareRecord} />
      )}

      {!isNewOnboardingHousehold && filteredFlowers.length > plantPageSize ? (
        <nav className="plant-pagination" aria-label="Plant pages">
          <button type="button" disabled={plantPage === 1} onClick={() => setPlantPage(1)} aria-label="First page">
            &lt;&lt;
          </button>
          <button
            type="button"
            disabled={plantPage === 1}
            onClick={() => setPlantPage((currentPage) => Math.max(1, currentPage - 1))}
            aria-label="Previous page"
          >
            &lt;
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
            &gt;
          </button>
          <button type="button" disabled={plantPage === plantPageCount} onClick={() => setPlantPage(plantPageCount)} aria-label="Last page">
            &gt;&gt;
          </button>
        </nav>
      ) : null}

      {!isNewOnboardingHousehold && filteredFlowers.length === 0 ? (
        <section className="empty-state">
          <Home size={34} aria-hidden="true" />
          <h2>{t("dashboard.emptySearch")}</h2>
          <p>{t("dashboard.emptySearchBody")}</p>
        </section>
      ) : null}
      <MobileBottomNav currentPage="plants" onAddPlant={openAddPlantFromMobileNav} t={t} />
    </main>
  );
};
