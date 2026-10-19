import assert from "node:assert/strict";
import test from "node:test";
import { createResilientStorage } from "../src/lib/browserStorage.js";
import { awaitImageOperation } from "../src/lib/imageOperation.js";
import { addPlantFromPhoto } from "../src/features/plants/services/addPlant.js";
import type { GeneratedCare } from "../src/utils/customFlower.js";
import { safeFailureMetadata } from "../src/lib/errorDiagnostics.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useCareActions } from "../src/features/care/hooks/useCareActions.js";
import { withRequestTimeout } from "../src/lib/requestTimeout.js";
import { usePlantActions } from "../src/features/plants/hooks/usePlantActions.js";
import { lockDialogScroll } from "../src/lib/dialogScrollLock.js";

test("nested dialogs restore scrolling correctly even when they close out of order", () => {
  const document = { body: { style: { overflow: "auto" } } } as Document;
  const closeFirst = lockDialogScroll(document);
  const closeSecond = lockDialogScroll(document);
  closeFirst();
  assert.equal(document.body.style.overflow, "hidden");
  closeFirst();
  closeSecond();
  assert.equal(document.body.style.overflow, "auto");
});

test("request deadlines release callers even when an external adapter ignores abort", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let failure: unknown;
  void withRequestTimeout(() => new Promise(() => undefined), 1000).catch(error => { failure = error; });
  context.mock.timers.tick(1000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((failure as Error | undefined)?.name, "TimeoutError");
});
import { uploadWithValidationRecovery } from "../src/lib/validatedImageUpload.js";
import { clearImageValidationReceipts, rememberImageValidationReceipt, imageValidationReceipt } from "../src/lib/imageValidationReceipts.js";

const receiptFailure = (code: string) => ({ context: Response.json({ code }, { status: 422 }) });

test("invalid or rotated receipts revalidate the existing bytes once, without reopening the picker", async () => {
  clearImageValidationReceipts();
  rememberImageValidationReceipt("photo", { token: "rotated", expiresAt: Date.now() + 60_000 });
  const attempts: (string | undefined)[] = [];
  const result = await uploadWithValidationRecovery("photo", async receipt => {
    attempts.push(receipt);
    return receipt ? { data: null, error: receiptFailure("IMAGE_VALIDATION_REQUIRED") } : { data: { path: "same-upload-id" }, error: null };
  });
  assert.deepEqual(attempts, ["rotated", undefined]);
  assert.deepEqual(result, { path: "same-upload-id" });
  assert.equal(imageValidationReceipt("photo"), undefined);
});

test("expired receipts use server validation and ambiguous or denied uploads are never retried", async () => {
  clearImageValidationReceipts();
  rememberImageValidationReceipt("photo", { token: "expired", expiresAt: Date.now() - 1 });
  await uploadWithValidationRecovery("photo", async receipt => { assert.equal(receipt, undefined); return { data: {}, error: null }; });
  for (const code of ["IMAGE_NETWORK_FAILED", "HOUSEHOLD_ACCESS_DENIED", "IMAGE_VALIDATION_FAILED"]) {
    let calls = 0;
    await assert.rejects(uploadWithValidationRecovery("photo", async () => { calls++; return { data: null, error: receiptFailure(code) }; }), { code });
    assert.equal(calls, 1);
  }
  rememberImageValidationReceipt("photo", { token: "invalid", expiresAt: Date.now() + 60_000 });
  let calls = 0;
  await assert.rejects(uploadWithValidationRecovery("photo", async () => { calls++; return { data: null, error: receiptFailure("IMAGE_VALIDATION_REQUIRED") }; }), { code: "IMAGE_VALIDATION_REQUIRED" });
  assert.equal(calls, 2);
});

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

const plantActionHarness = () => {
  let nameEditorClosed = false;
  let deletionClosed = false;
  let actions!: ReturnType<typeof usePlantActions>;
  const Harness = () => {
    actions = usePlantActions({
      scopeKey: "account:household:1",
      isHouseholdOperationCurrent: () => true, plantSubmissionRef: { current: null }, pendingPlantIdRef: { current: null },
      newImageSelection: { image: null, isProcessing: false, isBusy: () => false, select: async () => undefined, clear() {}, cancel() {} },
      newPlantName: "", newPlantImage: null, setNewPlantStatus() {}, t: key => key,
      setIsAddingPlant() {}, activeSupabaseHouseholdId: "", selectedLanguage: "en", addFlower: async () => false,
      refreshHouseholdPlanUsage: async () => null, setNewPlantName() {}, setIsAddPlantModalOpen() {},
      setEditingNameFlowerId: value => { if (value === "") nameEditorClosed = true; }, setDraftFlowerName() {},
      draftFlowerName: "New name", saveFlower: async () => false, deleteFlowerId: "plant", isRemovingPlant: false,
      setIsRemovingPlant() {}, removeFlowerById: async () => false,
      setDeleteFlowerId: value => { if (value === "") deletionClosed = true; }, route: { page: "dashboard" },
    });
    return null;
  };
  renderToStaticMarkup(createElement(Harness));
  return { actions, nameEditorClosed: () => nameEditorClosed, deletionClosed: () => deletionClosed };
};

test("a failed plant rename keeps the editor and draft available for retry", async () => {
  const fixture = plantActionHarness();
  await fixture.actions.confirmNameEdit({ ...care, id: "plant", image: "photo", identification: "confident" });
  assert.equal(fixture.nameEditorClosed(), false);
});

test("a failed plant removal keeps the confirmation open and never navigates away", async () => {
  const fixture = plantActionHarness();
  await fixture.actions.confirmRemoveCustomFlower();
  assert.equal(fixture.deletionClosed(), false);
});

test("failed care persistence preserves the preview and never reports an applied care plan", async () => {
  const plant = { ...care, id: "plant", image: "photo", identification: "confident" as const };
  const statuses: string[] = [];
  let cleared = false;
  let actions!: ReturnType<typeof useCareActions>;
  const Harness = () => {
    actions = useCareActions({
      isHouseholdOperationCurrent: () => true, isGeneratingCarePreview: false,
      resolveCurrentAiDiagnosisAccess: () => ({ allowed: true, status: "allowed" }),
      aiDiagnosisAccessMessage: () => "", setCarePreviewStatus: value => { if (typeof value === "string") statuses.push(value); },
      setIsGeneratingCarePreview: () => undefined, t: key => key, supabasePlantIdsByLegacyId: {},
      auth: { isAuthenticated: false } as ReturnType<typeof import("../src/hooks/useAuth.js").useAuth>,
      activeSupabaseHouseholdId: "", selectedLanguage: "en", setCarePreview: value => { if (value === null) cleared = true; },
      carePreview: { flowerId: plant.id, nextCare: care }, flowerById: new Map([[plant.id, plant]]), saveFlower: async () => false,
    });
    return null;
  };
  renderToStaticMarkup(createElement(Harness));
  await actions.confirmCareUpdate();
  assert.equal(cleared, false);
  assert.equal(statuses.includes("detail.careUpdated"), false);
});

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
