import { flowerReportMeta } from "./flowers";
import type { StoredFlower, StoredFlowerRecords } from "./storage";

const thresholdPercent = 20;

const dateFormatter = new Intl.DateTimeFormat("sk-SK", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Bratislava",
});

const todayInBratislava = () =>
  new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Bratislava",
    year: "numeric",
  }).format(new Date());

const daysBetween = (fromIsoDate: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromIsoDate)) {
    return null;
  }

  const from = new Date(`${fromIsoDate}T00:00:00Z`);
  const today = new Date(`${todayInBratislava()}T00:00:00Z`);
  return Math.max(0, Math.floor((today.getTime() - from.getTime()) / 86_400_000));
};

const addDays = (isoDate: string, days: number) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return "";
  }

  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const formatDate = (isoDate: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return "Nezadané";
  }

  return dateFormatter.format(new Date(`${isoDate}T00:00:00Z`));
};

const progressFor = (lastWatered: string, intervalDays: number) => {
  const elapsed = daysBetween(lastWatered);

  if (elapsed === null) {
    return {
      nextWatering: "",
      percent: 0,
      statusText: "zálievka nezadaná",
    };
  }

  const percent = Math.max(0, Math.min(100, 100 - (elapsed / intervalDays) * 100));
  const daysLeft = intervalDays - elapsed;
  const nextWatering = addDays(lastWatered, intervalDays);

  if (daysLeft < 0) {
    return { nextWatering, percent, statusText: `mešká ${Math.abs(daysLeft)} d.` };
  }

  if (daysLeft === 0) {
    return { nextWatering, percent, statusText: "zaliať dnes" };
  }

  return { nextWatering, percent, statusText: `zaliať o ${daysLeft} d.` };
};

type ReportFlower = {
  id: string;
  displayName: string;
  likelyName: string;
  intervalDays: number;
};

const createReportFlowers = (customFlowers: StoredFlower[] = [], removedFlowerIds: string[] = []): ReportFlower[] => [
  ...customFlowers.map((flower) => ({
    displayName: flower.displayName,
    id: flower.id,
    intervalDays: flower.wateringIntervalDays ?? 7,
    likelyName: flower.likelyName,
  })),
  ...flowerReportMeta.filter(
    (flower) => !customFlowers.some((customFlower) => customFlower.id === flower.id) && !removedFlowerIds.includes(flower.id),
  ),
];

export const getReportRows = (records: StoredFlowerRecords, customFlowers: StoredFlower[] = [], removedFlowerIds: string[] = []) =>
  createReportFlowers(customFlowers, removedFlowerIds)
    .map((flower) => {
      const record = records[flower.id] ?? { lastFertilized: "", note: "", lastWatered: "", lastTransplanted: "" };
      const progress = progressFor(record.lastWatered, flower.intervalDays);

      return {
        flower,
        lastWatered: formatDate(record.lastWatered),
        nextWatering: formatDate(progress.nextWatering),
        note: record.note.trim(),
        progress,
      };
    })
    .filter((row) => row.progress.percent < thresholdPercent)
    .sort((left, right) => left.progress.percent - right.progress.percent);

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export const createEmailReport = (records: StoredFlowerRecords, customFlowers: StoredFlower[] = [], removedFlowerIds: string[] = []) => {
  const rows = getReportRows(records, customFlowers, removedFlowerIds);
  const subject = `Plantie report: ${rows.length} rastlín pod ${thresholdPercent} %`;

  const htmlRows = rows
    .map(
      (row) => `
        <tr>
          <td>
            <strong>${escapeHtml(row.flower.displayName)}</strong><br>
            <span style="color:#617069">${escapeHtml(row.flower.likelyName)}</span>
          </td>
          <td style="font-weight:700">${Math.round(row.progress.percent)} %</td>
          <td>${escapeHtml(row.lastWatered)}</td>
          <td>${escapeHtml(row.nextWatering)}</td>
          <td>${escapeHtml(row.progress.statusText)}</td>
          <td>${row.note ? escapeHtml(row.note) : "-"}</td>
        </tr>`,
    )
    .join("");

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;color:#12221b;line-height:1.5">
      <h1 style="margin:0 0 8px;font-size:24px">Plantie denný report</h1>
      <p style="margin:0 0 18px;color:#617069">
        V reporte sú iba rastliny s úrovňou zálievky pod ${thresholdPercent} %. Rastliny nad ${thresholdPercent} % nie sú zahrnuté.
      </p>
      ${
        rows.length
          ? `<table style="width:100%;border-collapse:collapse">
              <thead>
                <tr style="background:#123d31;color:#fff;text-align:left">
                  <th style="padding:10px">Rastlina</th>
                  <th style="padding:10px">Zálievka</th>
                  <th style="padding:10px">Posledná zálievka</th>
                  <th style="padding:10px">Ďalšia zálievka</th>
                  <th style="padding:10px">Stav</th>
                  <th style="padding:10px">Poznámka</th>
                </tr>
              </thead>
              <tbody>${htmlRows}</tbody>
            </table>`
          : `<p style="padding:14px;background:#dcebd8;border-radius:12px">Žiadna rastlina nie je pod ${thresholdPercent} % zálievky.</p>`
      }
    </div>`;

  const text = rows.length
    ? rows
        .map(
          (row, index) =>
            `${index + 1}. ${row.flower.displayName} - ${Math.round(row.progress.percent)} %, posledná zálievka: ${row.lastWatered}, stav: ${row.progress.statusText}`,
        )
        .join("\n")
    : `Žiadna rastlina nie je pod ${thresholdPercent} % zálievky.`;

  return { html, rows, subject, text };
};
