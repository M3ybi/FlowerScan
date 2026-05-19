import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";
import type { StoredPlantDiagnostic } from "./diagnostics";
import { sanitizeDiagnostics } from "./diagnostics";
import { flowerReportMeta } from "./flowers";
import { createHouseholdScopedKey, isValidHouseholdTokenValue } from "./household-scope";

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
  notificationsEnabled?: boolean;
  soil: string;
  careTips: string[];
};

export type StoredPushSubscription = {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    auth: string;
    p256dh: string;
  };
};

export type StoredPlantState = {
  customFlowers: StoredFlower[];
  diagnostics: StoredPlantDiagnostic[];
  records: StoredFlowerRecords;
  removedFlowerIds: string[];
};

export type ReportSettings = {
  recipient: string;
  lastSentDate: string;
  lastPushNotificationDate?: string;
};

export type StoredHousehold = {
  id: string;
  publicToken: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

const emptyRecord: StoredFlowerRecord = {
  note: "",
  lastWatered: "",
  lastTransplanted: "",
};

const store = () => getStore("flowscan");
const householdRegistryKey = "households";

export const headers = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json; charset=utf-8",
};

export const createEmptyRecords = (): StoredFlowerRecords =>
  Object.fromEntries(flowerReportMeta.map((flower) => [flower.id, { ...emptyRecord }]));

export const isValidHouseholdToken = isValidHouseholdTokenValue;

export const generateHouseholdToken = () => randomBytes(24).toString("base64url");

export const getHouseholdTokenFromRequest = (event: { queryStringParameters?: Record<string, string | undefined> | null; headers: Record<string, string | undefined>; body?: string | null }) => {
  const queryToken = event.queryStringParameters?.householdId ?? event.queryStringParameters?.household;
  const headerToken = event.headers["x-household-id"] ?? event.headers["X-Household-Id"];

  if (isValidHouseholdToken(queryToken)) {
    return queryToken;
  }

  if (isValidHouseholdToken(headerToken)) {
    return headerToken;
  }

  if (event.body) {
    try {
      const body = JSON.parse(event.body) as { householdId?: unknown; householdToken?: unknown };
      const bodyToken = body.householdId ?? body.householdToken;
      return isValidHouseholdToken(bodyToken) ? bodyToken : "";
    } catch {
      return "";
    }
  }

  return "";
};

const scopedKey = createHouseholdScopedKey;

const sanitizeHousehold = (value: unknown): StoredHousehold | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const household = value as Partial<StoredHousehold>;
  if (!isValidHouseholdToken(household.publicToken)) {
    return null;
  }

  const createdAt = typeof household.createdAt === "string" ? household.createdAt : new Date().toISOString();
  const updatedAt = typeof household.updatedAt === "string" ? household.updatedAt : createdAt;

  return {
    createdAt,
    id: typeof household.id === "string" && household.id ? household.id.slice(0, 100) : household.publicToken,
    name: typeof household.name === "string" && household.name.trim() ? household.name.trim().slice(0, 80) : "Moja domácnosť",
    publicToken: household.publicToken,
    updatedAt,
  };
};

const sanitizeHouseholds = (value: unknown): StoredHousehold[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Map<string, StoredHousehold>();
  for (const item of value) {
    const household = sanitizeHousehold(item);
    if (household) {
      unique.set(household.publicToken, household);
    }
  }

  return [...unique.values()];
};

export const readHouseholds = async () => sanitizeHouseholds(await store().get(householdRegistryKey, { type: "json" }));

const writeHouseholds = async (households: StoredHousehold[]) => {
  await store().setJSON(householdRegistryKey, sanitizeHouseholds(households));
};

export const getHouseholdByToken = async (householdToken: string) => {
  if (!isValidHouseholdToken(householdToken)) {
    return null;
  }

  const households = await readHouseholds();
  return households.find((household) => household.publicToken === householdToken) ?? null;
};

const readLegacyPlantState = async () => {
  const state = await store().get("plant-state", { type: "json" });
  if (state) {
    return sanitizePlantState(state);
  }

  const records = await store().get("records", { type: "json" });
  return sanitizePlantState({ customFlowers: [], diagnostics: [], records: records ?? createEmptyRecords(), removedFlowerIds: [] });
};

const migrateLegacyDataToHousehold = async (householdToken: string) => {
  const existingState = await store().get(scopedKey(householdToken, "plant-state"), { type: "json" });
  if (!existingState) {
    await store().setJSON(scopedKey(householdToken, "plant-state"), await readLegacyPlantState());
  }

  const settings = await store().get("settings", { type: "json" });
  if (settings && !(await store().get(scopedKey(householdToken, "settings"), { type: "json" }))) {
    await store().setJSON(scopedKey(householdToken, "settings"), settings);
  }

  const subscriptions = await store().get("push-subscriptions", { type: "json" });
  if (subscriptions && !(await store().get(scopedKey(householdToken, "push-subscriptions"), { type: "json" }))) {
    await store().setJSON(scopedKey(householdToken, "push-subscriptions"), subscriptions);
  }
};

export const createHousehold = async (name?: string) => {
  const households = await readHouseholds();
  const now = new Date().toISOString();
  let publicToken = process.env.DEFAULT_HOUSEHOLD_TOKEN && households.length === 0 ? process.env.DEFAULT_HOUSEHOLD_TOKEN : generateHouseholdToken();

  while (!isValidHouseholdToken(publicToken) || households.some((household) => household.publicToken === publicToken)) {
    publicToken = generateHouseholdToken();
  }

  const household: StoredHousehold = {
    createdAt: now,
    id: publicToken,
    name: typeof name === "string" && name.trim() ? name.trim().slice(0, 80) : "Moja domácnosť",
    publicToken,
    updatedAt: now,
  };

  await writeHouseholds([household, ...households]);

  if (households.length === 0) {
    await migrateLegacyDataToHousehold(publicToken);
  } else {
    await store().setJSON(scopedKey(publicToken, "plant-state"), sanitizePlantState({}));
  }

  return household;
};

export const requireHousehold = async (householdToken: string) => {
  const household = await getHouseholdByToken(householdToken);
  if (!household) {
    throw new Error("Household access is required.");
  }

  return household;
};

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

export const readRecords = async (householdToken: string) => {
  await requireHousehold(householdToken);
  const records = await store().get(scopedKey(householdToken, "records"), { type: "json" });
  return sanitizeRecords(records ?? createEmptyRecords());
};

export const writeRecords = async (householdToken: string, records: StoredFlowerRecords) => {
  await requireHousehold(householdToken);
  await store().setJSON(scopedKey(householdToken, "records"), sanitizeRecords(records));
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
    notificationsEnabled: flower.notificationsEnabled !== false,
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
    diagnostics: sanitizeDiagnostics(input.diagnostics),
    records: sanitizeRecords(input.records),
    removedFlowerIds: Array.isArray(input.removedFlowerIds)
      ? input.removedFlowerIds.filter((id): id is string => typeof id === "string").map((id) => id.slice(0, 120)).slice(0, 200)
      : [],
  };
};

export const readPlantState = async (householdToken: string) => {
  await requireHousehold(householdToken);
  const state = await store().get(scopedKey(householdToken, "plant-state"), { type: "json" });
  if (state) {
    return sanitizePlantState(state);
  }

  const records = await readRecords(householdToken);
  return sanitizePlantState({ customFlowers: [], diagnostics: [], records, removedFlowerIds: [] });
};

export const writePlantState = async (householdToken: string, state: StoredPlantState) => {
  await requireHousehold(householdToken);
  const sanitizedState = sanitizePlantState(state);
  await store().setJSON(scopedKey(householdToken, "plant-state"), sanitizedState);
  await store().setJSON(scopedKey(householdToken, "records"), sanitizedState.records);
};

export const sanitizePushSubscription = (value: unknown): StoredPushSubscription | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const subscription = value as Partial<StoredPushSubscription>;
  const keys = subscription.keys;

  if (
    typeof subscription.endpoint !== "string" ||
    !subscription.endpoint.startsWith("https://") ||
    !keys ||
    typeof keys.auth !== "string" ||
    typeof keys.p256dh !== "string"
  ) {
    return null;
  }

  return {
    endpoint: subscription.endpoint.slice(0, 2000),
    expirationTime:
      typeof subscription.expirationTime === "number" && Number.isFinite(subscription.expirationTime)
        ? subscription.expirationTime
        : null,
    keys: {
      auth: keys.auth.slice(0, 500),
      p256dh: keys.p256dh.slice(0, 500),
    },
  };
};

export const readPushSubscriptions = async (householdToken: string) => {
  await requireHousehold(householdToken);
  const subscriptions = await store().get(scopedKey(householdToken, "push-subscriptions"), { type: "json" });
  return Array.isArray(subscriptions)
    ? subscriptions.map(sanitizePushSubscription).filter((subscription): subscription is StoredPushSubscription => Boolean(subscription))
    : [];
};

export const writePushSubscriptions = async (householdToken: string, subscriptions: StoredPushSubscription[]) => {
  await requireHousehold(householdToken);
  const uniqueSubscriptions = new Map(
    subscriptions
      .map(sanitizePushSubscription)
      .filter((subscription): subscription is StoredPushSubscription => Boolean(subscription))
      .map((subscription) => [subscription.endpoint, subscription]),
  );

  await store().setJSON(scopedKey(householdToken, "push-subscriptions"), [...uniqueSubscriptions.values()]);
};

export const readSettings = async (householdToken: string): Promise<ReportSettings> => {
  await requireHousehold(householdToken);
  const settings = (await store().get(scopedKey(householdToken, "settings"), { type: "json" })) as Partial<ReportSettings> | null;
  return {
    recipient: typeof settings?.recipient === "string" ? settings.recipient : "",
    lastSentDate: typeof settings?.lastSentDate === "string" ? settings.lastSentDate : "",
    lastPushNotificationDate:
      typeof settings?.lastPushNotificationDate === "string" ? settings.lastPushNotificationDate : "",
  };
};

export const writeSettings = async (householdToken: string, settings: ReportSettings) => {
  await requireHousehold(householdToken);
  await store().setJSON(scopedKey(householdToken, "settings"), settings);
};

export const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
