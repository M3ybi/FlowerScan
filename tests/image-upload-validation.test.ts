import { jpegFixtureBytes, jpegFixtureAtSize, fixtureDataUrl } from "./fixtures/imagePayload.js";
import { imageUploadConfig, validateProcessedImageDataUrl } from "../src/lib/imageUploadConfig.js";
import { ImageUploadError, imageErrorFromResponse, imageErrorMessage } from "../src/lib/imageUploadErrors.js";
import assert from "node:assert/strict";
import test from "node:test";
import { parseValidatedJpeg } from "../src/lib/validatedImageInput.js";

test("decoded byte boundaries account for base64 padding and the old transport mismatch", () => {
  for (const size of [1024 * 1024, imageUploadConfig.maxProcessedBytes]) {
    const result = validateProcessedImageDataUrl(fixtureDataUrl(jpegFixtureAtSize(size)));
    assert.equal("code" in result, false);
    if (!("code" in result)) assert.equal(result.bytes.length, size);
  }
  assert.deepEqual(validateProcessedImageDataUrl(fixtureDataUrl(jpegFixtureAtSize(imageUploadConfig.maxProcessedBytes + 1))), { code: "IMAGE_TOO_LARGE", status: 413 });
});

test("claimed JPEG containing PNG bytes and private EXIF metadata are rejected", () => {
  assert.deepEqual(validateProcessedImageDataUrl("data:image/jpeg;base64,iVBORw0KGgo="), { code: "UNSUPPORTED_IMAGE_FORMAT", status: 415 });
  const bytes = new Uint8Array(jpegFixtureBytes.length + 6);
  bytes.set(jpegFixtureBytes.slice(0,2));
  bytes.set([255,225,0,4,0,0],2);
  bytes.set(jpegFixtureBytes.slice(2),8);
  assert.deepEqual(validateProcessedImageDataUrl(fixtureDataUrl(bytes)), { code: "INVALID_IMAGE", status: 400 });
});

test("structured upload errors retain their category and localize without server diagnostics", async () => {
  const error = await imageErrorFromResponse({ context: Response.json({ code: "IMAGE_TOO_LARGE", error: "private provider detail" }, { status: 413 }) });
  assert.equal(error?.code, "IMAGE_TOO_LARGE");
  assert.match(imageErrorMessage(error, "en")!, /2 MB/);
  assert.match(imageErrorMessage(error, "sk")!, /Spracovaná fotka/);
  assert.equal(imageErrorMessage(error,"en")?.includes("private"),false);
  assert.equal((await imageErrorFromResponse(new DOMException("", "TimeoutError")))?.code,"IMAGE_NETWORK_TIMEOUT");
  assert.equal((await imageErrorFromResponse(new TypeError("fetch failed")))?.code,"IMAGE_NETWORK_FAILED");
  assert.equal(await imageErrorFromResponse({ context: Response.json({ error: "Quota reached" }, { status: 403 }) }),null);
  assert.match(imageErrorMessage(new ImageUploadError("ORIGINAL_IMAGE_TOO_LARGE"),"sk")!,/15 MB/);
});

test("validated storage parser rejects malformed, oversized and mislabeled bytes", () => {
  assert.equal(parseValidatedJpeg("data:image/jpeg;base64,A"), null);
  assert.equal(parseValidatedJpeg("data:image/jpeg;base64,eA=="), null);
  assert.equal(parseValidatedJpeg("data:image/png;base64,/9j/AA=="), null);
  assert.equal(parseValidatedJpeg("data:image/jpeg;base64," + "A".repeat(3_000_000)), null);
  assert.equal(parseValidatedJpeg(fixtureDataUrl())?.contentType, "image/jpeg");
});
import {
  imageUploadRejectionMessage,
  isImageUploadAllowed,
  isImageUploadValidationPayload,
} from "../src/lib/imageUploadValidationRules.js";
import type { ImageUploadValidationPayload } from "../src/lib/imageUploadValidationRules.js";

const validPayload: ImageUploadValidationPayload = {
  containsPlant: true,
  failureReasons: [],
  hasExplicitOrUnsafeContent: false,
  hasRestrictedFootageOrPrivateContent: false,
  hasSensitiveBackground: false,
  plantConfidence: 0.91,
  safeUserMessage: "",
  shouldAllowUpload: true,
};

test("valid plant image validation payload is allowed", () => {
  assert.equal(isImageUploadValidationPayload(validPayload), true);
  assert.equal(isImageUploadAllowed(validPayload), true);
});

test("no plant image is rejected", () => {
  assert.equal(isImageUploadAllowed({ ...validPayload, containsPlant: false, failureReasons: ["no_plant"] }), false);
});

test("low-confidence plant image is rejected", () => {
  assert.equal(isImageUploadAllowed({ ...validPayload, plantConfidence: 0.74 }), false);
});

test("plant image with a visible person or face is rejected", () => {
  assert.equal(isImageUploadAllowed({ ...validPayload, hasSensitiveBackground: true, failureReasons: ["face"] }), false);
});

test("plant image with personal data, documents, or screen content is rejected", () => {
  assert.equal(isImageUploadAllowed({ ...validPayload, hasSensitiveBackground: true, failureReasons: ["document"] }), false);
});

test("explicit or unsafe image is rejected", () => {
  assert.equal(isImageUploadAllowed({ ...validPayload, hasExplicitOrUnsafeContent: true, failureReasons: ["unsafe"] }), false);
});

test("restricted or private footage is rejected", () => {
  assert.equal(isImageUploadAllowed({ ...validPayload, hasRestrictedFootageOrPrivateContent: true, failureReasons: ["restricted"] }), false);
});

test("malformed validation payload is rejected by strict type check", () => {
  assert.equal(isImageUploadValidationPayload({ ...validPayload, failureReasons: "no_plant" }), false);
  assert.equal(isImageUploadValidationPayload({ ...validPayload, plantConfidence: "0.91" }), false);
});

test("generic rejection message does not expose AI details", () => {
  assert.equal(
    imageUploadRejectionMessage,
    "Image contains sensitive/explicit information or does not contain a valid plant/tree. Please upload a clear plant image without sensitive background content.",
  );
});
