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

  const settings = await readSettings();
  const today = todayInBratislava();

  if (settings.lastPushNotificationDate === today) {
    return { statusCode: 200, body: "Skipped: push notification already sent today." };
  }

  const plantState = await readPlantState();
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
    return { statusCode: 200, body: "Skipped: no plants require watering today." };
  }

  const subscriptions = await readPushSubscriptions();
  if (subscriptions.length === 0) {
    return { statusCode: 200, body: "Skipped: no push subscriptions." };
  }

  webPush.setVapidDetails(subject, publicKey, privateKey);

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

  await writePushSubscriptions(validSubscriptions);
  await writeSettings({ ...settings, lastPushNotificationDate: today });

  const sentCount = sendResults.filter((result) => result.status === "fulfilled").length;
  return { statusCode: 200, body: `Sent ${sentCount} push notifications for ${duePlants.length} plants.` };
});
