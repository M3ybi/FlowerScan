import { CloudDrizzle, CloudSun, Droplet, Droplets, Flower2, Leaf, Sprout, Sun, SunDim, Waves, Wind } from "lucide-react";
import type { Flower } from "../data/flowers";
import { type createTranslator } from "../lib/i18n";
import type { GeneratedCare } from "../utils/customFlower";

export type CarePreview = {
  flowerId: string;
  nextCare: GeneratedCare;
};

export type CareDiffRow = {
  label: string;
  currentValue: string;
  nextValue: string;
};

const normalizeCareText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const includesAny = (value: string, keywords: string[]) => keywords.some((keyword) => value.includes(keyword));

const getWaterIconLevel = (value: string, intervalDays: number) => {
  const normalizedValue = normalizeCareText(value);

  if (
    includesAny(normalizedValue, [
      "nechat uplne vyschnut",
      "po uplnom vyschnuti",
      "po vyschnuti",
      "az po preschnuti",
      "az po vyschnuti",
      "mierne",
      "striedmo",
      "such",
      "sukulent",
      "kaktus",
    ]) ||
    intervalDays >= 14
  ) {
    return "low";
  }

  if (
    includesAny(normalizedValue, ["udrziavat vlhku", "stale mierne vlhku", "rovnomerne vlhku", "vela vody", "castejsie"]) ||
    intervalDays <= 5
  ) {
    return "high";
  }

  return "medium";
};

const getSunIconLevel = (value: string) => {
  const normalizedValue = normalizeCareText(value);

  if (includesAny(normalizedValue, ["plne slnko", "priame slnko", "vela svetla", "velmi jasne", "slnecne", "6 hodin"])) {
    return "full";
  }

  if (includesAny(normalizedValue, ["polotien", "tien", "menej svetla", "slabsie svetlo", "nizke svetlo"])) {
    return "low";
  }

  return "half";
};

const getHumidityIconLevel = (value: string) => {
  const normalizedValue = normalizeCareText(value);

  if (includesAny(normalizedValue, ["nizs", "nizka", "suchy vzduch", "bez rosenia", "nie je narocna", "bezna izbova"])) {
    return "low";
  }

  if (includesAny(normalizedValue, ["vysok", "vyss", "rosit", "vlhkomil", "terarium"])) {
    return "high";
  }

  return "medium";
};

const getDifficultyIconLevel = (value: string) => {
  const normalizedValue = normalizeCareText(value);

  if (includesAny(normalizedValue, ["nenaroc", "lahk", "jednoduch", "zaciatocnik", "odolna"])) {
    return "easy";
  }

  if (includesAny(normalizedValue, ["stredn", "mierna"])) {
    return "medium";
  }

  if (includesAny(normalizedValue, ["naroc", "citliv", "skusen"])) {
    return "hard";
  }

  return "medium";
};

const LowWaterIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 3.5 7.15 10.1A6 6 0 1 0 16.85 10L12 3.5Z"
      fill="currentColor"
      fillOpacity="0.18"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
    <path d="M8.8 16.1c.8.8 2 1.2 3.2 1.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="18.4" cy="15.5" r="1" fill="currentColor" />
    <circle cx="20.4" cy="18.4" r=".7" fill="currentColor" fillOpacity=".72" />
  </svg>
);

export const getCarePillVisual = (label: string, value: string, intervalDays: number) => {
  const normalizedLabel = normalizeCareText(label);

  if (includesAny(normalizedLabel, ["svetlo", "light", "licht", "lumiere", "luz"])) {
    const strength = getSunIconLevel(value);
    const Icon = strength === "full" ? Sun : strength === "low" ? SunDim : CloudSun;

    return (
      <span className={`pill-visual pill-sun pill-sun-${strength}`} aria-hidden="true">
        <Icon size={26} strokeWidth={1.8} />
      </span>
    );
  }

  if (includesAny(normalizedLabel, ["zalievka", "water", "bewasserung", "arrosage", "riego"])) {
    const level = getWaterIconLevel(value, intervalDays);
    const Icon = level === "low" ? LowWaterIcon : Droplets;

    return (
      <span className={`pill-visual pill-water pill-water-${level}`} aria-hidden="true">
        <Icon size={26} strokeWidth={1.8} />
      </span>
    );
  }

  if (includesAny(normalizedLabel, ["vlhkost", "humidity", "feuchtigkeit", "humidite", "humedad"])) {
    const level = getHumidityIconLevel(value);
    const Icon = level === "low" ? Wind : level === "high" ? CloudDrizzle : Waves;

    return (
      <span className={`pill-visual pill-humidity pill-humidity-${level}`} aria-hidden="true">
        <Icon size={26} strokeWidth={1.8} />
      </span>
    );
  }

  if (includesAny(normalizedLabel, ["narocnost", "difficulty", "schwierigkeit", "difficulte", "dificultad"])) {
    const level = getDifficultyIconLevel(value);
    const Icon = level === "easy" ? Sprout : level === "hard" ? Flower2 : Leaf;

    return (
      <span className={`pill-visual pill-difficulty pill-difficulty-${level}`} aria-hidden="true">
        <Icon size={26} strokeWidth={1.8} />
      </span>
    );
  }

  return (
    <span className="pill-visual pill-pot" aria-hidden="true">
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 13h14l-2 8H7Z" fill="currentColor" fillOpacity="0.14" />
        <path d="M4 13h16M12 13V8" />
        <path d="M12 9C7 9 5 6 5 3c5 0 7 3 7 6Zm0-2c0-3 3-5 7-5 0 4-3 7-7 7" className="pill-pot-leaves" />
      </svg>
    </span>
  );
};

const formatCarePills = (carePills: Flower["carePills"]) =>
  carePills.map((pill) => `${pill.label}: ${pill.value}`).join("\n");

const formatCareTips = (careTips: string[]) => careTips.map((tip) => `- ${tip}`).join("\n");

export const getCareDiffRows = (
  flower: Flower,
  nextCare: GeneratedCare,
  currentIntervalDays: number,
  t: ReturnType<typeof createTranslator>,
): CareDiffRow[] => {
  const candidates: CareDiffRow[] = [
    { label: t("careDiff.name"), currentValue: flower.displayName, nextValue: nextCare.displayName },
    { label: t("careDiff.botanicalId"), currentValue: flower.likelyName, nextValue: nextCare.likelyName },
    { label: t("careDiff.shortCare"), currentValue: flower.shortCare, nextValue: nextCare.shortCare },
    { label: t("careDiff.quickPills"), currentValue: formatCarePills(flower.carePills), nextValue: formatCarePills(nextCare.carePills) },
    { label: t("detail.light"), currentValue: flower.light, nextValue: nextCare.light },
    { label: t("plants.watering"), currentValue: flower.watering, nextValue: nextCare.watering },
    {
      label: t("careDiff.wateringInterval"),
      currentValue: t("careDiff.days", { count: currentIntervalDays }),
      nextValue: t("careDiff.days", { count: nextCare.wateringIntervalDays }),
    },
    { label: t("detail.substrate"), currentValue: flower.soil, nextValue: nextCare.soil },
    { label: t("detail.careTips"), currentValue: formatCareTips(flower.careTips), nextValue: formatCareTips(nextCare.careTips) },
    { label: t("careDiff.identificationNote"), currentValue: flower.identificationNote, nextValue: nextCare.identificationNote },
  ];

  return candidates.filter((row) => row.currentValue.trim() !== row.nextValue.trim());
};

export const applyGeneratedCareToFlower = (flower: Flower, nextCare: GeneratedCare): Flower => {
  const { displayName, identificationConfidence, ...careProfile } = nextCare;

  return {
    ...flower,
    ...careProfile,
    displayName: displayName.trim() || flower.displayName,
    identification: identificationConfidence,
    source: "custom",
  };
};
