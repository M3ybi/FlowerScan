import type { Flower } from "../data/flowers";
import { wateringIntervalsDays } from "../data/wateringIntervals";
import type { FlowerRecords } from "../hooks/useFlowerRecords";
import type { createTranslator } from "../lib/i18n";
import { getWateringProgress } from "../utils/watering";

type DashboardOverviewProps = {
  flowers: Flower[];
  records: FlowerRecords;
  t: ReturnType<typeof createTranslator>;
};

const emptyLastWatered = "";

const careSummaryKey = (dueNow: number, dueSoon: number) => {
  if (dueNow === 0 && dueSoon === 0) {
    return "dashboard.careSummaryClear";
  }

  if (dueNow === 0) {
    return dueSoon === 1 ? "dashboard.careSummarySoonOne" : "dashboard.careSummarySoonMany";
  }

  if (dueSoon === 0) {
    return dueNow === 1 ? "dashboard.careSummaryNowOne" : "dashboard.careSummaryNowMany";
  }

  if (dueNow === 1 && dueSoon === 1) {
    return "dashboard.careSummaryBothOneOne";
  }

  if (dueNow === 1) {
    return "dashboard.careSummaryBothOneMany";
  }

  return dueSoon === 1 ? "dashboard.careSummaryBothManyOne" : "dashboard.careSummaryBothManyMany";
};

export const DashboardOverview = ({ flowers, records, t }: DashboardOverviewProps) => {
  const plantCareStates = flowers.map((flower) => {
    const intervalDays = flower.wateringIntervalDays ?? wateringIntervalsDays[flower.id] ?? 7;
    const progress = getWateringProgress(records[flower.id]?.lastWatered ?? emptyLastWatered, intervalDays);
    return progress.state;
  });

  const dueNow = plantCareStates.filter((state) => state === "overdue" || state === "due").length;
  const dueSoon = plantCareStates.filter((state) => state === "soon").length;
  const summary = t(careSummaryKey(dueNow, dueSoon), { dueNow, dueSoon });

  return (
    <p className="dashboard-overview" role="status" aria-live="polite">
      {summary}
    </p>
  );
};
