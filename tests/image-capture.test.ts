import assert from "node:assert/strict";
import test from "node:test";
import {
  createPrivateImageSignedUrl,
  detectImageRuntime,
  preprocessImageFile,
  shouldUseNativeCamera,
  validateImageInput,
} from "../src/lib/imageCaptureService.js";
import { createDiagnosticImagePath, createPlantImagePath } from "../src/lib/imageStoragePaths.js";

const householdId = "11111111-1111-4111-8111-111111111111";
const plantId = "22222222-2222-4222-8222-222222222222";
const diagnosticId = "33333333-3333-4333-8333-333333333333";

test("image type validation accepts supported images", () => {
  assert.doesNotThrow(() => validateImageInput({ size: 1024, type: "image/jpeg" }));
  assert.doesNotThrow(() => validateImageInput({ size: 1024, type: "image/png" }));
  assert.doesNotThrow(() => validateImageInput({ size: 1024, type: "image/webp" }));
});

test("image type validation rejects unsupported images", () => {
  assert.throws(() => validateImageInput({ size: 1024, type: "image/gif" }), /JPG, PNG alebo WEBP/);
});

test("size validation rejects oversized and empty images", () => {
  assert.throws(() => validateImageInput({ size: 0, type: "image/jpeg" }), /prázdny/);
  assert.throws(() => validateImageInput({ size: 9 * 1024 * 1024, type: "image/jpeg" }), /príliš veľký/);
});

test("resize failure falls back to original JPEG payload", async () => {
  const file = new Blob(["jpeg"], { type: "image/jpeg" }) as Blob & { name?: string };
  file.name = "fallback.jpg";

  const result = await preprocessImageFile(file, {
    createPreviewUrl: () => "blob:preview",
    dataUrlFromBlob: async () => "data:image/jpeg;base64,ZmFsbGJhY2s=",
    transformImage: async () => {
      throw new Error("canvas unavailable");
    },
  });

  assert.equal(result.blob, file);
  assert.equal(result.dataUrl, "data:image/jpeg;base64,ZmFsbGJhY2s=");
  assert.equal(result.mimeType, "image/jpeg");
  assert.equal(result.previewUrl, "blob:preview");
});

test("path generation uses private household-scoped conventions", () => {
  assert.equal(createPlantImagePath(householdId, plantId), `${householdId}/plants/${plantId}/original.jpg`);
  assert.equal(createDiagnosticImagePath(householdId, diagnosticId), `${householdId}/diagnostics/${diagnosticId}/image.jpg`);
  assert.throws(() => createPlantImagePath("../bad", plantId), /householdId must be a UUID/);
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
