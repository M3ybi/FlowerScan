import assert from "node:assert/strict";
import test from "node:test";
import { createResilientStorage } from "../src/lib/browserStorage.js";
import { awaitImageOperation } from "../src/lib/imageOperation.js";
import { addPlantFromPhoto } from "../src/features/plants/services/addPlant.js";
import type { GeneratedCare } from "../src/utils/customFlower.js";
import { safeFailureMetadata } from "../src/lib/errorDiagnostics.js";

test("client diagnostics retain categories without provider messages or personal data", () => {
  const error = new Error("private@example.invalid data:image/jpeg;base64,secret");
  error.name = "private@example.invalid";
  assert.deepEqual(safeFailureMetadata(error), { code: "CLIENT_REQUEST_FAILED", name: "UnknownError" });
  assert.equal(safeFailureMetadata(new TypeError("secret")).name, "TypeError");
});

const memoryStorage = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } } as Storage;
};

test("blocked storage getters and quota errors preserve session changes and notify subscribers", () => {
  let blocked = true;
  const disk = memoryStorage();
  const store = createResilientStorage(() => { if (blocked) throw new Error("Blocked"); return disk; });
  let notices = 0;
  const unsubscribe = store.subscribe(() => notices++);
  assert.equal(store.storage.getItem("records"), null);
  store.storage.setItem("records", "new records");
  assert.equal(store.storage.getItem("records"), "new records");
  assert.equal(store.hasFailure(), true);
  assert.ok(notices > 0);
  blocked = false;
  disk.setItem("records", "recoverable existing records");
  store.storage.setItem("records", "session edits");
  assert.equal(disk.getItem("records"), "recoverable existing records", "never overwrite data we could not read");
  unsubscribe();
});

test("quota recovery persists the next update without losing the latest session value", () => {
  const disk = memoryStorage();
  const set = disk.setItem;
  disk.setItem = () => { throw new Error("QuotaExceededError"); };
  const store = createResilientStorage(() => disk);
  store.storage.setItem("records", "first");
  assert.equal(store.storage.getItem("records"), "first");
  assert.equal(store.hasFailure(), true);
  disk.setItem = set;
  store.storage.setItem("records", "second");
  assert.equal(disk.getItem("records"), "second");
  assert.equal(store.hasFailure(), false);
  store.storage.removeItem("records");
  assert.equal(store.storage.getItem("records"), null);
});

test("cancelling a stalled browser decoder releases the caller and closes a late bitmap", async () => {
  const controller = new AbortController();
  let complete!: (value: { close(): void }) => void;
  let closed = false;
  const result = awaitImageOperation<{ close(): void }>(() => new Promise(resolve => { complete = resolve; }), controller.signal, value => value.close());
  controller.abort();
  await assert.rejects(result, { name: "AbortError" });
  complete({ close: () => { closed = true; } });
  await Promise.resolve();
  assert.equal(closed, true);
  assert.equal(await awaitImageOperation(async () => "next photo"), "next photo");
});

test("a stalled encoder times out and a pre-aborted operation never starts", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = awaitImageOperation(() => new Promise(() => undefined), undefined, undefined, 30_000);
  const rejected = assert.rejects(pending, { name: "TimeoutError" });
  context.mock.timers.tick(30_000);
  await rejected;
  await assert.rejects(awaitImageOperation(async () => { assert.fail("must not start"); }, AbortSignal.abort()), { name: "AbortError" });
});

const care: GeneratedCare = { displayName: "Plant", identificationConfidence: "confident", likelyName: "Plant",
  identificationNote: "", shortCare: "Care", light: "Light", watering: "Water", soil: "Soil", wateringIntervalDays: 7, carePills: [], careTips: [] };

test("ten complete Add Plant submissions preserve language, photo identity and independent record IDs", async () => {
  const saved: string[] = [];
  for (let cycle = 0; cycle < 10; cycle++) {
    const imageDataUrl = `normalized-photo-${cycle}`;
    const result = await addPlantFromPhoto({ id: `plant-${cycle}`, name: "Plant", householdId: "home", language: "sk", imageDataUrl }, {
      isCurrent: () => true, onStage: () => undefined, assertCanAdd: async () => undefined,
      generateCare: async (_name, image, options) => { assert.equal(image, imageDataUrl); assert.equal(options.language, "sk"); return care; },
      save: async plant => { assert.equal(plant.image, imageDataUrl); saved.push(plant.id); return true; },
      refreshUsage: async () => undefined,
    });
    assert.equal(result?.id, `plant-${cycle}`);
  }
  assert.equal(new Set(saved).size, 10);
});

test("switching household during care generation cannot start plant persistence", async () => {
  let current = true;
  const result = await addPlantFromPhoto({ id: "retry-id", name: "Plant", householdId: "old-home", language: "en", imageDataUrl: "photo" }, {
    isCurrent: () => current, onStage: () => undefined, assertCanAdd: async () => undefined,
    generateCare: async () => { current = false; return care; },
    save: async () => { assert.fail("stale write"); }, refreshUsage: async () => assert.fail("stale usage refresh"),
  });
  assert.equal(result, null);
});

test("an unsuccessful save keeps the retry identity and never refreshes usage", async () => {
  const result = await addPlantFromPhoto({ id: "retry-id", name: "Plant", householdId: "home", language: "en", imageDataUrl: "photo" }, {
    isCurrent: () => true, onStage: () => undefined, assertCanAdd: async () => undefined,
    generateCare: async () => care,
    save: async plant => { assert.equal(plant.id, "retry-id"); return false; },
    refreshUsage: async () => assert.fail("usage refresh after failed save"),
  });
  assert.equal(result, null);
});
