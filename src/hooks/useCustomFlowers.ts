import { useEffect, useState } from "react";
import type { Flower } from "../data/flowers";

const storageKey = "flowscan-custom-flowers-v1";
const removedStorageKey = "flowscan-removed-flower-ids-v1";

const sanitizeCustomFlowers = (value: unknown): Flower[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is Flower => {
    if (!item || typeof item !== "object") {
      return false;
    }

    const flower = item as Partial<Flower>;
    return (
      typeof flower.id === "string" &&
      typeof flower.displayName === "string" &&
      typeof flower.likelyName === "string" &&
      typeof flower.image === "string" &&
      typeof flower.shortCare === "string" &&
      Array.isArray(flower.carePills) &&
      typeof flower.light === "string" &&
      typeof flower.watering === "string" &&
      typeof flower.soil === "string" &&
      Array.isArray(flower.careTips)
    );
  });
};

const readCustomFlowers = () => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    return sanitizeCustomFlowers(JSON.parse(window.localStorage.getItem(storageKey) ?? "[]"));
  } catch {
    return [];
  }
};

const readRemovedFlowerIds = () => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(removedStorageKey) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
};

export const useCustomFlowers = () => {
  const [customFlowers, setCustomFlowers] = useState<Flower[]>(() => readCustomFlowers());
  const [removedFlowerIds, setRemovedFlowerIds] = useState<string[]>(() => readRemovedFlowerIds());

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(customFlowers));
  }, [customFlowers]);

  useEffect(() => {
    window.localStorage.setItem(removedStorageKey, JSON.stringify(removedFlowerIds));
  }, [removedFlowerIds]);

  const addCustomFlower = (flower: Flower) => {
    setCustomFlowers((current) => [flower, ...current.filter((item) => item.id !== flower.id)]);
  };

  const updateFlower = (flower: Flower) => {
    setCustomFlowers((current) => [flower, ...current.filter((item) => item.id !== flower.id)]);
  };

  const removeFlower = (flowerId: string) => {
    setCustomFlowers((current) => current.filter((item) => item.id !== flowerId));
    setRemovedFlowerIds((current) => (current.includes(flowerId) ? current : [...current, flowerId]));
  };

  return { addCustomFlower, customFlowers, removeFlower, removedFlowerIds, updateFlower };
};
