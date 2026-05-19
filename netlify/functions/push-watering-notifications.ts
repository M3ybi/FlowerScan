import { schedule } from "@netlify/functions";
import webPush from "web-push";
import { flowerReportMeta } from "./_shared/flowers";
import {
  createPushNotificationPayload,
  getDueWateringPlants,
  recordsForNotifications,
  storedFlowerToNotificationFlower,
  todayInBratislava,
} from "./_shared/notifications";
import {
  readHouseholds,
  readPlantState,
  readPushSubscriptions,
  readSettings,
  writePushSubscriptions,
  writeSettings,
} from "./_shared/storage";

const bratislavaHour = () =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    timeZone: "Europe/Bratislava",
  }).format(new Date());

export const handler = schedule("0 * * * *", async () => {
  if (bratislavaHour() !== "09") {
    return { statusCode: 200, body: "Skipped: not 09:00 Europe/Bratislava." };
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

  if (!publicKey || !privateKey) {
    return { statusCode: 503, body: "Skipped: VAPID keys are not configured." };
  }

  const today = todayInBratislava();
  const households = await readHouseholds();
  let sentCount = 0;
  let duePlantCount = 0;

  webPush.setVapidDetails(subject, publicKey, privateKey);

  for (const household of households) {
    const settings = await readSettings(household.publicToken);

    if (settings.lastPushNotificationDate === today) {
      continue;
    }

    const plantState = await readPlantState(household.publicToken);
    const customFlowers = plantState.customFlowers.map(storedFlowerToNotificationFlower);
    const flowers = [
      ...customFlowers,
      ...flowerReportMeta
        .filter(
          (flower) =>
            !customFlowers.some((customFlower) => customFlower.id === flower.id) &&
            !plantState.removedFlowerIds.includes(flower.id),
        )
        .map((flower) => ({
          displayName: flower.displayName,
          id: flower.id,
          intervalDays: flower.intervalDays,
          likelyName: flower.likelyName,
          notificationsEnabled: true,
        })),
    ];
    const duePlants = getDueWateringPlants(flowers, recordsForNotifications(plantState.records), today);
    const payload = createPushNotificationPayload(duePlants);

    if (!payload) {
      continue;
    }

    const subscriptions = await readPushSubscriptions(household.publicToken);
    if (subscriptions.length === 0) {
      continue;
    }

    const sendResults = await Promise.allSettled(
      subscriptions.map((subscription) => webPush.sendNotification(subscription, JSON.stringify(payload))),
    );
    const validSubscriptions = subscriptions.filter((_, index) => {
      const result = sendResults[index];
      if (result.status === "fulfilled") {
        return true;
      }

      const statusCode = (result.reason as { statusCode?: unknown })?.statusCode;
      return statusCode !== 404 && statusCode !== 410;
    });

    await writePushSubscriptions(household.publicToken, validSubscriptions);
    await writeSettings(household.publicToken, { ...settings, lastPushNotificationDate: today });
    sentCount += sendResults.filter((result) => result.status === "fulfilled").length;
    duePlantCount += duePlants.length;
  }

  return { statusCode: 200, body: `Sent ${sentCount} push notifications for ${duePlantCount} plants.` };
});
