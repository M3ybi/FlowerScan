import type { FlowerRecords } from "../hooks/useFlowerRecords";

const recordHasValue = (record: FlowerRecords[string] | undefined) =>
  Boolean(record?.note || record?.lastFertilized || record?.lastWatered || record?.lastTransplanted);

export const mergeCloudRecords = (localRecords: FlowerRecords, cloudRecords: FlowerRecords) => {
  const flowerIds = new Set([...Object.keys(localRecords), ...Object.keys(cloudRecords)]);

  return Object.fromEntries(
    [...flowerIds].map((flowerId) => [
      flowerId,
      recordHasValue(cloudRecords[flowerId]) ? cloudRecords[flowerId] : localRecords[flowerId],
    ]),
  ) as FlowerRecords;
};

export const areStringRecordsEqual = (left: Record<string, string>, right: Record<string, string>) => {
  const leftEntries = Object.entries(left);
  if (leftEntries.length !== Object.keys(right).length) {
    return false;
  }

  return leftEntries.every(([key, value]) => right[key] === value);
};
