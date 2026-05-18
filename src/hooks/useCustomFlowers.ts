import { useEffect, useState } from "react";
import type { Flower } from "../data/flowers";

const storageKey = "flowscan-custom-flowers-v1";

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
      flower.id.startsWith("custom-") &&
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

export const useCustomFlowers = () => {
  const [customFlowers, setCustomFlowers] = useState<Flower[]>(() => readCustomFlowers());

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(customFlowers));
  }, [customFlowers]);

  const addCustomFlower = (flower: Flower) => {
    setCustomFlowers((current) => [flower, ...current.filter((item) => item.id !== flower.id)]);
  };

  const removeCustomFlower = (flowerId: string) => {
    setCustomFlowers((current) => current.filter((item) => item.id !== flowerId));
  };

  return { addCustomFlower, customFlowers, removeCustomFlower };
};
