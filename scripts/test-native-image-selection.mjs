import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

// Explicit emulator + loopback CDP only. Never install, reset or drive a user's
// physical device. The separate offline fixture must already be installed.
const serial = process.env.PLANTIE_TEST_ADB_SERIAL;
if (!/^emulator-\d+$/.test(serial ?? "")) throw new Error("Set PLANTIE_TEST_ADB_SERIAL to the dedicated disposable emulator.");
const endpoint = new URL(process.env.PLANTIE_TEST_CDP_URL ?? "http://127.0.0.1:9229");
if (!["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname) || endpoint.protocol !== "http:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash)
  throw new Error("Only a loopback CDP endpoint is allowed.");
const adb = process.env.ANDROID_HOME ? path.join(process.env.ANDROID_HOME, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb") : "adb";
const run = args => execFileSync(adb, ["-s", serial, ...args], { encoding: "utf8", windowsHide: true, timeout: 15_000 });
const dump = () => { run(["shell", "uiautomator", "dump", "/sdcard/plantie-v4-ui.xml"]); return run(["shell", "cat", "/sdcard/plantie-v4-ui.xml"]); };
const find = (xml, text) => [...xml.matchAll(/<node\b[^>]*>/g)].map(item => item[0]).filter(item => text.test(item)).map(item => item.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)).filter(Boolean);
const tap = bounds => run(["shell", "input", "tap", String(Math.floor((Number(bounds[1]) + Number(bounds[3])) / 2)), String(Math.floor((Number(bounds[2]) + Number(bounds[4])) / 2))]);
const browser = await chromium.connectOverCDP(endpoint.origin);
try {
  const page = browser.contexts()[0].pages().find(item => item.url() === "https://localhost/");
  assert.ok(page, "offline Capacitor fixture is open");
  assert.match(await page.locator("h1").innerText(), /OFFLINE image selection/);
  const state = () => page.evaluate(() => window.__nativeImageFixture);
  assert.equal((await state()).runtime, "android");
  assert.equal((await state()).busy, false);
  for (const kind of ["add", "diagnosis"]) {
    while ((await state())[kind] < 10) {
      const before = await state();
      await page.locator(`#${kind}`).click();
      let xml = dump();
      assert.match(xml, /package="com\.google\.android\.photopicker"/, "expected native photo picker");
      const dismiss = find(xml, /text="Dismiss"/);
      if (dismiss.length) { tap(dismiss[0]); xml = dump(); }
      const photos = find(xml, /content-desc="Photo taken /).filter(item => Number(item[2]) < 2000);
      assert.ok(photos.length, "synthetic local gallery photos are indexed");
      tap(photos[before[kind] % photos.length]);
      xml = dump();
      const done = find(xml, /text="Done"/);
      if (done.length) tap(done[0]);
      await page.waitForFunction(() => !window.__nativeImageFixture.busy, { timeout: 30_000 });
      const after = await state();
      assert.equal(after.error, null, "native acquisition and JPEG normalization succeed");
      assert.equal(after[kind], before[kind] + 1);
      console.log(`${kind}: ${after[kind]} native selections normalized`);
    }
  }
  const beforeCancel = await state();
  await page.locator("#add").click();
  assert.match(dump(), /package="com\.google\.android\.photopicker"/);
  run(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  await page.waitForFunction(() => !window.__nativeImageFixture.busy, { timeout: 30_000 });
  const result = await state();
  assert.equal(result.add, 10); assert.equal(result.diagnosis, 10);
  assert.equal(result.cancelled, beforeCancel.cancelled + 1); assert.equal(result.error, null);
  await writeFile(".tmp-tests/native-image-selection.json", JSON.stringify({ ...result, environment: "disposable Android emulator", scope: "actual native gallery and normalizer; no Auth, AI, uploads or database" }, null, 2));
  console.log("PASS: 10 Add-like + 10 Diagnosis-like native selections and picker cancellation; physical/end-to-end acceptance remains blocked.");
} finally { await browser.close(); }
