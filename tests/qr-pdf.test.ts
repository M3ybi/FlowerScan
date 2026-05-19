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
  assert.equal(readSpecNumber("labelSizeMm"), 14);
  assert.equal(readSpecNumber("qrSizeMm"), 12);
  assert.equal(readSpecNumber("quietZoneMm"), 1);
});

test("QR label validation message uses current dimensions", () => {
  assert.match(source, /qrLabelSpec\.labelSizeMm/);
  assert.match(source, /qrLabelSpec\.qrSizeMm/);
  assert.match(source, /payload.*flowerId/s);
});
