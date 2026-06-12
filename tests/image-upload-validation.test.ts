import assert from "node:assert/strict";
import test from "node:test";
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
