import { useEffect, useState } from "react";
import type { Flower } from "../data/flowers";

export type FlowerRecord = {
  note: string;
  lastFertilized: string;
  lastWatered: string;
  lastTransplanted: string;
};

export type FlowerRecords = Record<string, FlowerRecord>;

const storageKey = "flowscan-flower-records-v1";

const emptyRecord: FlowerRecord = {
  lastFertilized: "",
  note: "",
  lastWatered: "",
  lastTransplanted: "",
};

const createInitialRecords = (flowers: Flower[]): FlowerRecords =>
  Object.fromEntries(flowers.map((flower) => [flower.id, { ...emptyRecord }]));

const sanitizeRecord = (record: Partial<FlowerRecord> | undefined): FlowerRecord => ({
  lastFertilized: typeof record?.lastFertilized === "string" ? record.lastFertilized : "",
  note: typeof record?.note === "string" ? record.note : "",
  lastWatered: typeof record?.lastWatered === "string" ? record.lastWatered : "",
  lastTransplanted: typeof record?.lastTransplanted === "string" ? record.lastTransplanted : "",
});

const sanitizeRecords = (value: unknown): FlowerRecords => {
  if (!value || typeof value !== "object") {
    return {};
  }

  const input = value as Partial<FlowerRecords>;
  return Object.fromEntries(
    Object.entries(input)
      .filter(([flowerId]) => typeof flowerId === "string" && flowerId.length > 0)
      .map(([flowerId, record]) => [flowerId, sanitizeRecord(record)]),
  );
};

const readRecords = (flowers: Flower[]): FlowerRecords => {
  if (typeof window === "undefined") {
    return createInitialRecords(flowers);
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) {
      return createInitialRecords(flowers);
    }

    const parsed = sanitizeRecords(JSON.parse(rawValue));
    return Object.fromEntries(
      flowers.map((flower) => [
        flower.id,
        sanitizeRecord(parsed[flower.id]),
      ]),
    );
  } catch {
    return createInitialRecords(flowers);
  }
};

export const useFlowerRecords = (flowers: Flower[]) => {
  const [records, setRecords] = useState<FlowerRecords>(() => readRecords(flowers));

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(records));
  }, [records]);

  useEffect(() => {
    setRecords((current) => ({
      ...Object.fromEntries(flowers.map((flower) => [flower.id, current[flower.id] ?? { ...emptyRecord }])),
    }));
  }, [flowers]);

  const updateRecord = (flowerId: string, patch: Partial<FlowerRecord>) => {
    setRecords((current) => ({
      ...current,
      [flowerId]: {
        ...(current[flowerId] ?? emptyRecord),
        ...patch,
      },
    }));
  };

  const replaceRecords = (nextRecords: FlowerRecords) => {
    setRecords(sanitizeRecords(nextRecords));
  };

  return { records, replaceRecords, updateRecord };
};
