import { getStore } from "@netlify/blobs";
import { flowerReportMeta } from "./flowers";

export type StoredFlowerRecord = {
  note: string;
  lastWatered: string;
  lastTransplanted: string;
};

export type StoredFlowerRecords = Record<string, StoredFlowerRecord>;

export type StoredFlower = {
  id: string;
  displayName: string;
  likelyName: string;
  identification: "confident" | "likely" | "needs-confirmation";
  identificationNote: string;
  image: string;
  source?: "built-in" | "custom";
  shortCare: string;
  carePills: {
    label: string;
    value: string;
    tone: "green" | "amber" | "blue" | "rose";
  }[];
  light: string;
  watering: string;
  wateringIntervalDays?: number;
  soil: string;
  careTips: string[];
};

export type StoredPlantState = {
  customFlowers: StoredFlower[];
  records: StoredFlowerRecords;
  removedFlowerIds: string[];
};

export type ReportSettings = {
  recipient: string;
  lastSentDate: string;
};

const emptyRecord: StoredFlowerRecord = {
  note: "",
  lastWatered: "",
  lastTransplanted: "",
};

const store = () => getStore("flowscan");

export const headers = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json; charset=utf-8",
};

export const createEmptyRecords = (): StoredFlowerRecords =>
  Object.fromEntries(flowerReportMeta.map((flower) => [flower.id, { ...emptyRecord }]));

export const sanitizeRecords = (value: unknown): StoredFlowerRecords => {
  const input = value && typeof value === "object" ? (value as Partial<StoredFlowerRecords>) : {};

  const builtInRecords = Object.fromEntries(
    flowerReportMeta.map((flower) => {
      const record = input[flower.id];

      return [
        flower.id,
        {
          note: typeof record?.note === "string" ? record.note.slice(0, 4000) : "",
          lastWatered: typeof record?.lastWatered === "string" ? record.lastWatered : "",
          lastTransplanted: typeof record?.lastTransplanted === "string" ? record.lastTransplanted : "",
        },
      ];
    }),
  );

  const dynamicRecords = Object.fromEntries(
    Object.entries(input)
      .filter(([flowerId]) => typeof flowerId === "string" && flowerId.length > 0)
      .map(([flowerId, record]) => [
        flowerId,
        {
          note: typeof record?.note === "string" ? record.note.slice(0, 4000) : "",
          lastWatered: typeof record?.lastWatered === "string" ? record.lastWatered : "",
          lastTransplanted: typeof record?.lastTransplanted === "string" ? record.lastTransplanted : "",
        },
      ]),
  );

  return { ...builtInRecords, ...dynamicRecords };
};

export const readRecords = async () => {
  const records = await store().get("records", { type: "json" });
  return sanitizeRecords(records ?? createEmptyRecords());
};

export const writeRecords = async (records: StoredFlowerRecords) => {
  await store().setJSON("records", sanitizeRecords(records));
};

const sanitizeFlower = (value: unknown): StoredFlower | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const flower = value as Partial<StoredFlower>;
  const identification = flower.identification;
  const carePills = Array.isArray(flower.carePills)
    ? flower.carePills
        .map((pill) => ({
          label: typeof pill?.label === "string" ? pill.label.slice(0, 40) : "",
          value: typeof pill?.value === "string" ? pill.value.slice(0, 80) : "",
          tone: pill?.tone,
        }))
        .filter(
          (pill): pill is StoredFlower["carePills"][number] =>
            Boolean(pill.label && pill.value) &&
            (pill.tone === "green" || pill.tone === "amber" || pill.tone === "blue" || pill.tone === "rose"),
        )
        .slice(0, 5)
    : [];
  const careTips = Array.isArray(flower.careTips)
    ? flower.careTips.filter((tip): tip is string => typeof tip === "string").map((tip) => tip.slice(0, 180)).slice(0, 5)
    : [];

  if (
    typeof flower.id !== "string" ||
    typeof flower.displayName !== "string" ||
    typeof flower.likelyName !== "string" ||
    typeof flower.identificationNote !== "string" ||
    typeof flower.image !== "string" ||
    typeof flower.shortCare !== "string" ||
    typeof flower.light !== "string" ||
    typeof flower.watering !== "string" ||
    typeof flower.soil !== "string" ||
    carePills.length === 0 ||
    careTips.length === 0 ||
    (identification !== "confident" && identification !== "likely" && identification !== "needs-confirmation")
  ) {
    return null;
  }

  return {
    carePills,
    careTips,
    displayName: flower.displayName.slice(0, 90),
    id: flower.id.slice(0, 120),
    identification,
    identificationNote: flower.identificationNote.slice(0, 300),
    image: flower.image.slice(0, 1_500_000),
    likelyName: flower.likelyName.slice(0, 140),
    light: flower.light.slice(0, 300),
    shortCare: flower.shortCare.slice(0, 300),
    soil: flower.soil.slice(0, 300),
    source: flower.source === "built-in" ? "built-in" : "custom",
    watering: flower.watering.slice(0, 300),
    wateringIntervalDays:
      typeof flower.wateringIntervalDays === "number" && Number.isFinite(flower.wateringIntervalDays)
        ? Math.max(1, Math.min(90, Math.round(flower.wateringIntervalDays)))
        : undefined,
  };
};

export const sanitizePlantState = (value: unknown): StoredPlantState => {
  const input = value && typeof value === "object" ? (value as Partial<StoredPlantState>) : {};

  return {
    customFlowers: Array.isArray(input.customFlowers)
      ? input.customFlowers.map(sanitizeFlower).filter((flower): flower is StoredFlower => Boolean(flower)).slice(0, 120)
      : [],
    records: sanitizeRecords(input.records),
    removedFlowerIds: Array.isArray(input.removedFlowerIds)
      ? input.removedFlowerIds.filter((id): id is string => typeof id === "string").map((id) => id.slice(0, 120)).slice(0, 200)
      : [],
  };
};

export const readPlantState = async () => {
  const state = await store().get("plant-state", { type: "json" });
  if (state) {
    return sanitizePlantState(state);
  }

  const records = await readRecords();
  return sanitizePlantState({ customFlowers: [], records, removedFlowerIds: [] });
};

export const writePlantState = async (state: StoredPlantState) => {
  const sanitizedState = sanitizePlantState(state);
  await store().setJSON("plant-state", sanitizedState);
  await writeRecords(sanitizedState.records);
};

export const readSettings = async (): Promise<ReportSettings> => {
  const settings = (await store().get("settings", { type: "json" })) as Partial<ReportSettings> | null;
  return {
    recipient: typeof settings?.recipient === "string" ? settings.recipient : "",
    lastSentDate: typeof settings?.lastSentDate === "string" ? settings.lastSentDate : "",
  };
};

export const writeSettings = async (settings: ReportSettings) => {
  await store().setJSON("settings", settings);
};

export const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
