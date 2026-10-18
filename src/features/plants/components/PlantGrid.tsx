import { ArrowRight, Droplets } from "lucide-react";
import type { Flower } from "../../../data/flowers";
import type { FlowerRecords } from "../../../hooks/useFlowerRecords";
import type { createTranslator } from "../../../lib/i18n";
import { wateringIntervalsDays } from "../../../data/wateringIntervals";
import { getWateringProgress } from "../../../utils/watering";
import { todayIsoDate } from "../../../app/appFormatting";
import { flowerPath } from "../../../utils/links";
type Props = {
  t: ReturnType<typeof createTranslator>;
  visibleFlowers: Flower[];
  records: FlowerRecords;
  formatAppWateringStatus: (value: ReturnType<typeof getWateringProgress>) => string;
  updateCareRecord: (id: string, patch: { lastWatered: string }, message: string) => Promise<unknown>;
};
export const PlantGrid = ({ t, visibleFlowers, records, formatAppWateringStatus, updateCareRecord }: Props) => (
      <section className="flower-grid" aria-label={t("dashboard.hero")}>
        {visibleFlowers.map((flower) => {
          const record = records[flower.id] ?? { lastFertilized: "", note: "", lastWatered: "", lastTransplanted: "" };
          const intervalDays = flower.wateringIntervalDays ?? wateringIntervalsDays[flower.id] ?? 7;
          const wateringProgress = getWateringProgress(record.lastWatered, intervalDays);

          return (
            <article
              className="flower-card"
              key={flower.id}
              role="link"
              tabIndex={0}
              aria-label={t("plants.openPlant", { plant: flower.displayName })}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("button,a")) {
                  return;
                }
                window.location.hash = flowerPath(flower.id).slice(1);
              }}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) {
                  return;
                }
                event.preventDefault();
                window.location.hash = flowerPath(flower.id).slice(1);
              }}
            >
              <img src={flower.image} alt={flower.displayName} loading="lazy" />
              <div className="flower-card-body">
                <div className="card-topline">
                  <span className="flower-index">{flower.id.replace("flower-", "#")}</span>
                </div>
                <h2>{flower.displayName}</h2>
                <div className={`image-watering image-watering-${wateringProgress.state}`}>
                  <div className="image-watering-label">
                    <span>{t("plants.watering")}</span>
                    <strong>{Math.round(wateringProgress.percent)} %</strong>
                  </div>
                  <div className="image-progress-track">
                    <div className="image-progress-fill" style={{ width: `${wateringProgress.percent}%` }} />
                  </div>
                  <small>{formatAppWateringStatus(wateringProgress)}</small>
                </div>
                <div className="plant-card-actions">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void updateCareRecord(flower.id, { lastWatered: todayIsoDate() }, t("detail.savedWatered"));
                    }}
                  >
                    <Droplets size={16} aria-hidden="true" />
                    {t("plants.water")}
                  </button>
                  <a className="plant-card-open-action" href={flowerPath(flower.id)} onClick={(event) => event.stopPropagation()} aria-label={t("plants.openPlant", { plant: flower.displayName })}>
                    <ArrowRight size={17} aria-hidden="true" />
                    {t("plants.open")}
                  </a>
                </div>
              </div>
            </article>
          );
        })}
      </section>
);
