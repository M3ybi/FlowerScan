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

export const getCarePillVisual = (label: string, value: string, intervalDays: number) => {
  const normalizedLabel = normalizeCareText(label);

  if (normalizedLabel.includes("svetlo")) {
    const strength = getSunIconLevel(value);

    return (
      <span className={`pill-visual pill-sun pill-sun-${strength}`} aria-hidden="true">
        <span />
      </span>
    );
  }

  if (normalizedLabel.includes("zalievka")) {
    const level = getWaterIconLevel(value, intervalDays);

    return (
      <span className={`pill-visual pill-water pill-water-${level}`} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    );
  }

  if (normalizedLabel.includes("vlhkost")) {
    const level = getHumidityIconLevel(value);

    return (
      <span className={`pill-visual pill-humidity pill-humidity-${level}`} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    );
  }

  if (normalizedLabel.includes("narocnost")) {
    const level = getDifficultyIconLevel(value);

    return (
      <span className={`pill-visual pill-difficulty pill-difficulty-${level}`} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    );
  }

  return (
    <span className="pill-visual pill-pot" aria-hidden="true">
      <span />
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
