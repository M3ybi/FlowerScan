import { imageUploadConfig } from "../src/lib/imageUploadConfig.js";
import { jpegFixtureBytes, jpegFixtureAtSize, fixtureDataUrl } from "./fixtures/imagePayload.js";
import assert from "node:assert/strict";
import test from "node:test";
import { withRequestTimeout } from "../src/lib/requestTimeout.js";
import { ImageUploadError } from "../src/lib/imageUploadErrors.js";

test("request timeout aborts stalled work and releases its timer", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let signal: AbortSignal | undefined;
  const request = withRequestTimeout((value) => {
    signal = value;
    return new Promise((_, reject) => value.addEventListener("abort", () => reject(value.reason), { once: true }));
  }, 60_000);
  assert.equal(signal?.aborted, false);
  context.mock.timers.tick(60_000);
  await assert.rejects(request, { name: "TimeoutError" });
  assert.equal(signal?.aborted, true);
});

test("request timeout never aborts completed work, including rejected operations", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const signals: AbortSignal[] = [];
  assert.equal(await withRequestTimeout(async (signal) => { signals.push(signal); return "complete"; }, 60_000), "complete");
  await assert.rejects(withRequestTimeout(async (signal) => { signals.push(signal); throw new Error("fixture rejection"); }, 60_000), /fixture rejection/);
  context.mock.timers.tick(60_000);
  assert.ok(signals.every((signal) => !signal.aborted));
});

test("selection cancellation propagates to HTTP work even when the SDK wraps abort errors", async () => {
  const parent = new AbortController();
  const result = withRequestTimeout(async (signal) => {
    parent.abort();
    assert.equal(signal.aborted, true);
    return { error: new TypeError("SDK wrapped abort") };
  }, 60_000, parent.signal);
  await assert.rejects(result, { name: "AbortError" });
  let invoked = false;
  await assert.rejects(withRequestTimeout(async () => { invoked = true; }, 60_000, parent.signal), { name: "AbortError" });
  assert.equal(invoked, false);
});
import {
  createPrivateImageSignedUrl,
  detectImageRuntime,
  preprocessImageFile,
  shouldUseNativeCamera,
  validateImageInput,
} from "../src/lib/imageCaptureService.js";
import { createDiagnosticImagePath, createPlantImagePath, getRetryImageId } from "../src/lib/imageStoragePaths.js";

const householdId = "11111111-1111-4111-8111-111111111111";
const plantId = "22222222-2222-4222-8222-222222222222";
const diagnosticId = "33333333-3333-4333-8333-333333333333";

const jpeg = new Blob([jpegFixtureBytes], { type: "image/jpeg" });
const options = {
  createPreviewUrl: () => "blob:preview",
  dataUrlFromBlob: async (blob: Blob) => fixtureDataUrl(new Uint8Array(await blob.arrayBuffer())),
};

test("a second gallery file read failure is classified instead of escaping as a generic error", async () => {
  await preprocessImageFile(jpeg, { ...options, transformImage: async () => ({ blob: jpeg, dataUrl: "unused" }) });
  const unreadable = new Blob([jpegFixtureBytes], { type: "image/jpeg" });
  Object.defineProperty(unreadable, "arrayBuffer", { value: async () => { throw new DOMException("Gallery access lost", "NotReadableError"); } });
  Object.defineProperty(unreadable, "slice", { value: () => unreadable });
  await assert.rejects(() => preprocessImageFile(unreadable, options), { code: "IMAGE_READ_FAILED" });
});

test("a transient gallery read retries once, then decoders use only the owned snapshot", async () => {
  const file = new Blob([jpegFixtureBytes], { type: "image/jpeg" });
  let reads = 0;
  Object.defineProperty(file, "arrayBuffer", { value: async () => {
    if (++reads === 1) throw new DOMException("Temporary gallery read", "NotReadableError");
    if (reads > 2) throw new DOMException("Gallery grant expired", "NotReadableError");
    return jpegFixtureBytes.slice().buffer;
  } });
  const result = await preprocessImageFile(file, { ...options, transformImage: async (snapshot) => {
    assert.notEqual(snapshot, file);
    assert.deepEqual(new Uint8Array(await snapshot.arrayBuffer()), jpegFixtureBytes);
    return { blob: jpeg, dataUrl: "unused" };
  } });
  assert.equal(reads, 2);
  assert.equal(result.mimeType, "image/jpeg");
});

test("generic gallery MIME types are sniffed while supported mismatches remain rejected", async () => {
  for (const type of ["", "application/octet-stream", "image/jpg"]) {
    const result = await preprocessImageFile(new Blob([jpegFixtureBytes], { type }), { ...options,
      transformImage: async (snapshot) => { assert.equal(snapshot.type, "image/jpeg"); return { blob: jpeg, dataUrl: "unused" }; },
    });
    assert.equal(result.mimeType, "image/jpeg");
  }
});

test("an aborted selection stops before reading or decoding another file", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => preprocessImageFile(jpeg, { signal: controller.signal }), { name: "AbortError" });
});

test("a stalled provider stream times out, cancels and releases the reader", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } }, { highWaterMark: 0 });
  const file = new File([], "provider.jpg", { type: "image/jpeg" });
  Object.defineProperty(file, "stream", { value: () => stream });
  const pending = preprocessImageFile(file, options);
  context.mock.timers.tick(30_000);
  await assert.rejects(pending, (error: unknown) => {
    assert.ok(error instanceof ImageUploadError);
    assert.equal(error.code, "IMAGE_READ_FAILED");
    assert.equal(error.stage, "file-read");
    assert.ok(error.cause instanceof DOMException);
    assert.equal(error.cause.name, "TimeoutError");
    return true;
  });
  assert.equal(cancelled, true);
  assert.equal(stream.locked, false);
});

test("original type and 15 MiB boundaries are enforced", () => {
  for (const type of imageUploadConfig.supportedInputMimeTypes) assert.doesNotThrow(() => validateImageInput({ size: 15 * 1024 * 1024, type }));
  assert.throws(() => validateImageInput({ size: 15 * 1024 * 1024 + 1, type: "image/jpeg" }), { code: "ORIGINAL_IMAGE_TOO_LARGE" });
  assert.throws(() => validateImageInput({ size: 0, type: "image/jpeg" }), { code: "INVALID_IMAGE" });
  assert.throws(() => validateImageInput({ size: 1024, type: "image/gif" }), { code: "UNSUPPORTED_IMAGE_FORMAT" });
});

test("1 MiB and 8 MiB JPEG originals and 14.9 MiB PNG reach the codec and produce JPEG", async () => {
  for (const [size, type] of [[1024 * 1024, "image/jpeg"], [8 * 1024 * 1024, "image/jpeg"], [Math.floor(14.9 * 1024 * 1024), "image/png"]] as const) {
    const header = type === "image/png" ? new Uint8Array([137,80,78,71,13,10,26,10]) : jpegFixtureBytes;
    const file = new Blob([header, new Uint8Array(size - header.length)], { type });
    let attempts = 0;
    const result = await preprocessImageFile(file, { ...options, transformImage: async (original, dimension, quality) => {
      attempts++;
      assert.notEqual(original, file);
      assert.equal(original.size, file.size);
      assert.equal(original.type, file.type);
      assert.equal(dimension, 1600);
      assert.equal(quality, 0.85);
      return { blob: jpeg, dataUrl: "unused" };
    } });
    assert.equal(result.mimeType, "image/jpeg");
    assert.equal(result.previewUrl, "blob:preview");
    assert.equal(attempts, 1);
  }
});

test("oversized original and MIME mismatch are rejected before decoding", async () => {
  let calls = 0;
  const transformImage = async () => { calls++; return { blob: jpeg, dataUrl: "unused" }; };
  await assert.rejects(() => preprocessImageFile(new Blob([new Uint8Array(15 * 1024 * 1024 + 1)], { type: "image/jpeg" }), { ...options, transformImage }), { code: "ORIGINAL_IMAGE_TOO_LARGE" });
  await assert.rejects(() => preprocessImageFile(new Blob([jpegFixtureBytes], { type: "image/png" }), { ...options, transformImage }), { code: "UNSUPPORTED_IMAGE_FORMAT" });
  assert.equal(calls, 0);
});

test("adaptive attempts encode the original and stop as soon as the 2 MiB limit is met", async () => {
  const calls: number[] = [];
  const oversized = new Blob([jpegFixtureAtSize(imageUploadConfig.maxProcessedBytes + 1)], { type: "image/jpeg" });
  const result = await preprocessImageFile(jpeg, { ...options, transformImage: async (original, _dimension, quality) => {
    assert.notEqual(original, jpeg);
    assert.equal(original.size, jpeg.size);
    calls.push(quality);
    return { blob: calls.length === 1 ? oversized : jpeg, dataUrl: "unused" };
  } });
  assert.deepEqual(calls, [0.85, 0.75]);
  assert.equal(result.sizeBytes, jpeg.size);
});

test("a first result between 1 and 2 MiB keeps its initial quality", async () => {
  let attempts = 0;
  const blob = new Blob([jpegFixtureAtSize(Math.floor(1.5 * 1024 * 1024))], { type: "image/jpeg" });
  const result = await preprocessImageFile(jpeg, { ...options, transformImage: async () => { attempts++; return { blob, dataUrl: "unused" }; } });
  assert.equal(attempts, 1);
  assert.equal(result.sizeBytes, blob.size);
});

test("compression attempts are bounded and never return an oversized fallback", async () => {
  let attempts = 0;
  const blob = new Blob([new Uint8Array(imageUploadConfig.maxProcessedBytes + 1)], { type: "image/jpeg" });
  await assert.rejects(() => preprocessImageFile(jpeg, { ...options, transformImage: async () => { attempts++; return { blob, dataUrl: "unused" }; } }), { code: "IMAGE_COMPRESSION_FAILED" });
  assert.equal(attempts, imageUploadConfig.compressionAttempts.length);
  await assert.rejects(() => preprocessImageFile(jpeg, { ...options, transformImage: async () => { throw new Error("decode failed"); } }), { code: "IMAGE_COMPRESSION_FAILED" });
});

test("path generation uses private household-scoped conventions", () => {
  assert.equal(createPlantImagePath(householdId, plantId), `${householdId}/plants/${plantId}/original.jpg`);
  assert.equal(createDiagnosticImagePath(householdId, diagnosticId), `${householdId}/diagnostics/${diagnosticId}/image.jpg`);
  assert.throws(() => createPlantImagePath("../bad", plantId), /householdId must be a UUID/);
});

test("retries reuse an image object while different content and households stay separate", async () => {
  const first = await getRetryImageId(householdId,"record",jpeg);
  const retry = await getRetryImageId(householdId,"record",new Blob([jpegFixtureBytes],{type:"image/jpeg"}));
  assert.equal(first,retry);
  assert.notEqual(first,await getRetryImageId(diagnosticId,"record",jpeg));
  assert.notEqual(first,await getRetryImageId(householdId,"record",new Blob(["changed"])));
});

test("runtime branching separates web and native camera runtimes", () => {
  assert.equal(detectImageRuntime("web"), "web");
  assert.equal(detectImageRuntime("ios"), "ios");
  assert.equal(detectImageRuntime("android"), "android");
  assert.equal(shouldUseNativeCamera("web"), false);
  assert.equal(shouldUseNativeCamera("ios"), true);
  assert.equal(shouldUseNativeCamera("android"), true);
});

test("signed URL creation is short-lived and mocked at the storage boundary", async () => {
  const calls: Array<{ bucket: string; expiresIn: number; path: string }> = [];
  const client = {
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string, expiresIn: number) => {
          calls.push({ bucket, expiresIn, path });
          return { data: { signedUrl: "https://example.test/signed" }, error: null };
        },
      }),
    },
  };

  const url = await createPrivateImageSignedUrl(client, "plant-images", `${householdId}/plants/${plantId}/original.jpg`, 120);

  assert.equal(url, "https://example.test/signed");
  assert.deepEqual(calls, [
    {
      bucket: "plant-images",
      expiresIn: 120,
      path: `${householdId}/plants/${plantId}/original.jpg`,
    },
  ]);
});
