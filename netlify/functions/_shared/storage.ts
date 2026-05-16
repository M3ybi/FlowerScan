import { getStore } from "@netlify/blobs";
import { flowerReportMeta } from "./flowers";

export type StoredFlowerRecord = {
  note: string;
  lastWatered: string;
  lastTransplanted: string;
};

export type StoredFlowerRecords = Record<string, StoredFlowerRecord>;

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

  return Object.fromEntries(
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
};

export const readRecords = async () => {
  const records = await store().get("records", { type: "json" });
  return sanitizeRecords(records ?? createEmptyRecords());
};

export const writeRecords = async (records: StoredFlowerRecords) => {
  await store().setJSON("records", sanitizeRecords(records));
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
