import assert from "node:assert/strict";
import test from "node:test";
import { createPushNotificationPayload, getDueWateringPlants } from "../netlify/functions/_shared/notifications.js";

const today = "2026-05-19";
const flowers = [
  { displayName: "Adenium", id: "flower-04", intervalDays: 7, notificationsEnabled: true },
  { displayName: "Fitónia", id: "flower-02", intervalDays: 3, notificationsEnabled: false },
  { displayName: "Kávovník", id: "flower-18", intervalDays: 5, notificationsEnabled: true },
  { displayName: "Lopatkovec", id: "flower-03", intervalDays: 4, notificationsEnabled: true },
];

test("plant due today and notifications enabled", () => {
  const duePlants = getDueWateringPlants(
    [flowers[0]],
    { "flower-04": { lastWatered: "2026-05-12" } },
    today,
  );

  assert.deepEqual(duePlants, [{ displayName: "Adenium", id: "flower-04" }]);
});

test("plant due today but notifications disabled", () => {
  const duePlants = getDueWateringPlants(
    [flowers[1]],
    { "flower-02": { lastWatered: "2026-05-16" } },
    today,
  );

  assert.deepEqual(duePlants, []);
});

test("plant not due today", () => {
  const duePlants = getDueWateringPlants(
    [flowers[2]],
    { "flower-18": { lastWatered: "2026-05-17" } },
    today,
  );

  assert.deepEqual(duePlants, []);
});

test("already watered plant is not due", () => {
  const duePlants = getDueWateringPlants(
    [flowers[3]],
    { "flower-03": { lastWatered: today } },
    today,
  );

  assert.deepEqual(duePlants, []);
});

test("notification payload uses one daily tag to avoid duplicate notifications", () => {
  const duePlants = [{ displayName: "Adenium", id: "flower-04" }];
  const firstPayload = createPushNotificationPayload(duePlants);
  const secondPayload = createPushNotificationPayload(duePlants);

  assert.equal(firstPayload?.tag, secondPayload?.tag);
  assert.match(firstPayload?.tag ?? "", /^watering-\d{4}-\d{2}-\d{2}$/);
});

test("no notification when the due list is empty", () => {
  assert.equal(createPushNotificationPayload([]), null);
});
