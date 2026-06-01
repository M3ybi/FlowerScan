import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve("src/utils/qrPdf.ts"), "utf8");

const readSpecNumber = (key: string) => {
  const match = source.match(new RegExp(`${key}:\\s*(\\d+)`));
  assert.ok(match, `${key} should be present in qrLabelSpec`);
  return Number(match[1]);
};

test("QR labels are smaller for tongue depressor sticks", () => {
  assert.equal(readSpecNumber("labelSizeMm"), 10);
  assert.equal(readSpecNumber("qrSizeMm"), 8);
  assert.equal(readSpecNumber("quietZoneMm"), 1);
});

test("QR label validation message uses current dimensions", () => {
  assert.match(source, /qrLabelSpec\.labelSizeMm/);
  assert.match(source, /qrLabelSpec\.qrSizeMm/);
  assert.match(source, /payload.*flowerId/s);
});

test("QR export uses low density settings for tiny print", () => {
  assert.match(source, /errorCorrectionLevel:\s*"L"/);
  assert.match(source, /margin:\s*1/);
});

test("QR export uses Plantie branding", () => {
  assert.match(source, /author:\s*"Plantie"/);
  assert.match(source, /title:\s*"Plantie QR labels"/);
  assert.match(source, /pdf\.save\("plantie-qr-labels-a4\.pdf"\)/);
});
