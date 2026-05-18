import { wateringIntervalsDays } from "../data/wateringIntervals";
import type { Flower } from "../data/flowers";
import type { FlowerRecords } from "../hooks/useFlowerRecords";
import { formatDate } from "./dates";
import { getWateringProgress } from "./watering";

export const reportThresholdPercent = 20;

export const getWateringReportRows = (records: FlowerRecords, flowers: Flower[]) =>
  flowers
    .map((flower) => {
      const record = records[flower.id] ?? { note: "", lastWatered: "", lastTransplanted: "" };
      const intervalDays = flower.wateringIntervalDays ?? wateringIntervalsDays[flower.id] ?? 7;
      const progress = getWateringProgress(record.lastWatered, intervalDays);

      return {
        flower,
        intervalDays,
        lastWateredLabel: formatDate(record.lastWatered),
        nextWateringLabel: formatDate(progress.nextWatering),
        note: record.note.trim(),
        progress,
        record,
      };
    })
    .filter((row) => row.progress.percent < reportThresholdPercent)
    .sort((left, right) => left.progress.percent - right.progress.percent);

export const createMailtoReportUrl = (recipient: string, records: FlowerRecords, flowers: Flower[]) => {
  const rows = getWateringReportRows(records, flowers);
  const lines = rows.length
    ? rows.flatMap((row, index) => [
        `${index + 1}. ${row.flower.displayName} (${row.flower.likelyName})`,
        `   Stav zálievky: ${Math.round(row.progress.percent)} %`,
        `   Posledná zálievka: ${row.lastWateredLabel}`,
        `   Ďalšia zálievka: ${row.nextWateringLabel}`,
        `   Interval: každých ${row.intervalDays} dní`,
        `   Stav: ${row.progress.statusText}`,
        row.note ? `   Poznámka: ${row.note}` : "",
        "",
      ])
    : ["Dnes nie je žiadna rastlina pod 20 % zálievky."];

  const subject = "FlowerScan report: rastliny pod 20 % zálievky";
  const body = [
    "Prehľad rastlín, ktoré sú pod 20 % zálievky.",
    "Rastliny nad 20 % nie sú v reporte zahrnuté.",
    "",
    ...lines.filter(Boolean),
  ].join("\n");

  return `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};
