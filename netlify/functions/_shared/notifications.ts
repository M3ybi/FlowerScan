export type NotificationFlower = {
  id: string;
  displayName: string;
  likelyName?: string;
  intervalDays: number;
  notificationsEnabled?: boolean;
};

export type NotificationRecord = {
  lastWatered: string;
};

export type NotificationStoredFlower = {
  id: string;
  displayName: string;
  likelyName: string;
  notificationsEnabled?: boolean;
  wateringIntervalDays?: number;
};

export type NotificationStoredRecords = Record<string, { lastWatered: string }>;

export type DueWateringPlant = {
  id: string;
  displayName: string;
};

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const daysBetween = (fromIsoDate: string, todayIsoDate: string) => {
  if (!isIsoDate(fromIsoDate) || !isIsoDate(todayIsoDate)) {
    return null;
  }

  const from = new Date(`${fromIsoDate}T00:00:00Z`);
  const today = new Date(`${todayIsoDate}T00:00:00Z`);
  return Math.floor((today.getTime() - from.getTime()) / 86_400_000);
};

export const todayInBratislava = () =>
  new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Bratislava",
    year: "numeric",
  }).format(new Date());

export const getDueWateringPlants = (
  flowers: NotificationFlower[],
  records: Record<string, NotificationRecord | undefined>,
  todayIsoDate: string,
): DueWateringPlant[] =>
  flowers
    .filter((flower) => flower.notificationsEnabled !== false)
    .filter((flower) => Number.isFinite(flower.intervalDays) && flower.intervalDays > 0)
    .flatMap((flower) => {
      const lastWatered = records[flower.id]?.lastWatered ?? "";
      const elapsedDays = daysBetween(lastWatered, todayIsoDate);

      if (elapsedDays === null || elapsedDays < flower.intervalDays) {
        return [];
      }

      return [{ displayName: flower.displayName, id: flower.id }];
    });

export const createPushNotificationPayload = (duePlants: DueWateringPlant[]) => {
  if (duePlants.length === 0) {
    return null;
  }

  const visibleNames = duePlants.slice(0, 5).map((plant) => plant.displayName);
  const remainingCount = duePlants.length - visibleNames.length;
  const body = remainingCount > 0 ? `${visibleNames.join(", ")} a ďalších ${remainingCount}` : visibleNames.join(", ");

  return {
    body,
    data: { url: "/" },
    tag: `watering-${todayInBratislava()}`,
    title: `Dnes treba zaliať tieto ${duePlants.length} rastliny.`,
  };
};

export const storedFlowerToNotificationFlower = (flower: NotificationStoredFlower): NotificationFlower => ({
  displayName: flower.displayName,
  id: flower.id,
  intervalDays: flower.wateringIntervalDays ?? 7,
  likelyName: flower.likelyName,
  notificationsEnabled: flower.notificationsEnabled,
});

export const recordsForNotifications = (records: NotificationStoredRecords) =>
  Object.fromEntries(
    Object.entries(records).map(([id, record]: [string, NotificationStoredRecords[string]]) => [
      id,
      { lastWatered: record.lastWatered },
    ]),
  );
