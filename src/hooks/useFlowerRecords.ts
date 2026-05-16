import { useEffect, useState } from "react";
import { flowers } from "../data/flowers";

export type FlowerRecord = {
  note: string;
  lastWatered: string;
  lastTransplanted: string;
};

export type FlowerRecords = Record<string, FlowerRecord>;

const storageKey = "flowscan-flower-records-v1";

const emptyRecord: FlowerRecord = {
  note: "",
  lastWatered: "",
  lastTransplanted: "",
};

const createInitialRecords = (): FlowerRecords =>
  Object.fromEntries(flowers.map((flower) => [flower.id, { ...emptyRecord }]));

const readRecords = (): FlowerRecords => {
  if (typeof window === "undefined") {
    return createInitialRecords();
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) {
      return createInitialRecords();
    }

    const parsed = JSON.parse(rawValue) as Partial<FlowerRecords>;
    return Object.fromEntries(
      flowers.map((flower) => [
        flower.id,
        {
          note: typeof parsed[flower.id]?.note === "string" ? parsed[flower.id]!.note : "",
          lastWatered:
            typeof parsed[flower.id]?.lastWatered === "string" ? parsed[flower.id]!.lastWatered : "",
          lastTransplanted:
            typeof parsed[flower.id]?.lastTransplanted === "string" ? parsed[flower.id]!.lastTransplanted : "",
        },
      ]),
    );
  } catch {
    return createInitialRecords();
  }
};

export const useFlowerRecords = () => {
  const [records, setRecords] = useState<FlowerRecords>(() => readRecords());

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(records));
  }, [records]);

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
    setRecords(
      Object.fromEntries(
        flowers.map((flower) => [
          flower.id,
          {
            note: typeof nextRecords[flower.id]?.note === "string" ? nextRecords[flower.id].note : "",
            lastWatered:
              typeof nextRecords[flower.id]?.lastWatered === "string" ? nextRecords[flower.id].lastWatered : "",
            lastTransplanted:
              typeof nextRecords[flower.id]?.lastTransplanted === "string"
                ? nextRecords[flower.id].lastTransplanted
                : "",
          },
        ]),
      ),
    );
  };

  return { records, replaceRecords, updateRecord };
};
