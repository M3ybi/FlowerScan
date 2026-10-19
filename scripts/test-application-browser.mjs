import assert from "node:assert/strict";
import { access, mkdir, writeFile, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { build } from "esbuild";
import { chromium, webkit } from "playwright";

const engine = process.argv.includes("--webkit") ? "webkit" : "chromium";
const artifacts = path.resolve(`.tmp-tests/application-${engine}`);
await mkdir(artifacts, { recursive: true });
await build({ entryPoints: ["tests/fixtures/application-browser.tsx"], outdir: artifacts, entryNames: "fixture",
  bundle: true, splitting: true, format: "esm", jsx: "automatic", platform: "browser", logLevel: "warning",
  define: { "import.meta.env": JSON.stringify({ DEV: true, VITE_BACKEND_PROVIDER: "netlify" }) }, plugins: [{
    name: "offline-purchase-boundaries", setup(builder) {
      builder.onResolve({ filter: /\/billingService(?:\.js)?$/ }, () => ({ path: "billing", namespace: "fixture" }));
      builder.onLoad({ filter: /billing/, namespace: "fixture" }, () => ({ contents: `
        export class BillingConfirmationPendingError extends Error {}
        export const revenueCatProductIds={premiumMonthly:'monthly',premiumYearly:'yearly'};
        const purchase=async()=>{window.__applicationFixture.purchaseCalls++;return {hasRevenueCatPremium:false}};
        export const getBillingService=()=>({getStatus:()=>({configured:true,runtime:'web'}),
          getAvailableProducts:async()=>[{id:'monthly',price:'fixture'},{id:'yearly',price:'fixture'}],
          purchasePremiumMonthly:purchase,purchasePremiumYearly:purchase,changePlan:purchase,
          initialize:async()=>{},logIn:async()=>{},logOut:async()=>{},getCustomerInfo:async()=>null});` }));
      builder.onLoad({ filter: /householdPlanService\.ts$/ }, async args => ({ loader: "ts",
        contents: (await readFile(args.path, "utf8")).replace(/export const beginHouseholdPurchase = async[\s\S]*?\n};/, `export const beginHouseholdPurchase=async()=>{const fixture=(window as any).__applicationFixture;fixture.beginCalls++;await new Promise<void>(resolve=>{fixture.releasePurchase=resolve;});};`) }));
    },
  }] });
await writeFile(path.join(artifacts, "index.html"), '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>');
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  const name = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  if (!/^[\w.-]+$/.test(name)) { response.writeHead(404).end(); return; }
  try {
    const file = name === "styles.css" ? path.resolve("src/styles.css") : path.join(artifacts, name);
    response.setHeader("Content-Type", name.endsWith(".js") ? "text/javascript" : name.endsWith(".css") ? "text/css" : "text/html");
    response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'");
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
const checks = [];
try {
  let executablePath;
  if (engine === "chromium") for (const candidate of [process.env.PLANTIE_TEST_BROWSER, "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"].filter(Boolean)) {
    try { await access(candidate); executablePath = candidate; break; } catch {}
  }
  browser = await (engine === "webkit" ? webkit : chromium).launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(origin);
  await page.locator(".flower-card").first().waitFor();
  checks.push("actual App renders the seeded local household");
  // Hold the first feature import until its loading fallback has mounted.
  let releaseDetail;
  const held = new Promise(resolve => { releaseDetail = resolve; });
  let interceptedDetail;
  const intercepted = new Promise(resolve => { interceptedDetail = resolve; });
  await page.route(/PlantDetailsPage-.*\.js$/, async route => { interceptedDetail(); await held; await route.continue(); });
  await page.evaluate(() => { location.hash = "/flower/fixture-plant?panel=diagnostics"; });
  await intercepted;
  await page.locator(".household-loading-panel").waitFor();
  releaseDetail();
  await page.locator("#diagnostic-history-panel").waitFor();
  await page.waitForFunction(() => document.activeElement?.id === "diagnostic-history-panel");
  checks.push("diagnosis history receives focus after its lazy screen resolves");
  await page.evaluate(() => { location.hash = "/"; });
  await page.locator(".flower-card").first().waitFor();
  const jpeg = Buffer.from((await page.evaluate(() => window.__applicationFixture.image)).split(",")[1], "base64");
  for (let index = 0; index < 10; index++) {
    await page.locator(".mobile-bottom-nav button:visible,.app-tab-nav button:visible").filter({ hasText: "Add plant" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add new plant" });
    await dialog.getByRole("textbox").fill(`Browser plant ${index}`);
    await dialog.locator('input[type="file"]').setInputFiles({ name: "fixture.jpg", mimeType: "image/jpeg", buffer: jpeg });
    await dialog.locator(".plant-image-preview").waitFor();
    await dialog.getByRole("button", { name: "Add plant", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.waitForFunction(count => JSON.parse(localStorage.getItem("flowscan-custom-flowers-v1")).length === count, index + 2);
  }
  assert.equal(await page.evaluate(() => window.__applicationFixture.calls["plant-care-ai"]), 10);
  assert.equal(await page.evaluate(() => window.__applicationFixture.calls["validate-plant-image"]), 10);
  checks.push("ten additions persist unique plants with one validation and care request per selection");
  for (const [width, height] of [[320,568],[390,844],[844,390],[768,1024],[1440,900]]) {
    await page.setViewportSize({ width, height });
    for (const hash of ["/", "/flower/fixture-plant", "/diagnose", "/qr", "/menu"]) {
      await page.evaluate(value => { location.hash = value; }, hash);
      const selector = hash === "/" ? ".flower-grid" : hash.startsWith("/flower") ? ".detail-shell" : hash === "/diagnose" ? "#diagnose-picker-title" : hash === "/qr" ? ".qr-shell" : ".menu-hub";
      await page.locator(selector).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${hash} overflows ${width}`);
    }
    checks.push(`five composed screens fit ${width}x${height}`);
  }
  await page.setViewportSize({ width:390,height:844 });
  await page.evaluate(() => { location.hash = "/"; });
  const add = page.locator(".mobile-bottom-nav button:visible,.app-tab-nav button:visible").filter({ hasText: "Add plant" }).first();
  await add.focus(); await page.keyboard.press("Enter"); await page.getByRole("dialog").waitFor();
  assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
  await page.keyboard.press("Shift+Tab");
  assert.ok(await page.getByRole("dialog").getByRole("button", { name: "Add plant", exact: true }).evaluate(node => node === document.activeElement));
  await page.keyboard.press("Tab");
  assert.ok(await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).evaluate(node => node === document.activeElement));
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.ok(await add.evaluate(node => node === document.activeElement));
  assert.notEqual(await page.evaluate(() => document.body.style.overflow), "hidden");
  checks.push("shared dialog Escape restores opener focus and page scrolling");
  await page.screenshot({ path: path.join(artifacts, "dashboard-mobile.png") });
  for (const kind of ["pricing", "upgrade"]) {
    await page.reload();
    await page.waitForFunction(() => !!window.__applicationFixture);
    await page.evaluate(value => window.__applicationFixture.showPurchase(value), kind);
    if (kind === "pricing") await page.locator('[aria-controls="pricing-plan-monthly"]').click();
    const buy = page.getByRole("button", { name: /Buy Monthly/i });
    await buy.waitFor(); await page.waitForFunction(() => [...document.querySelectorAll('button')].some(node => /Buy Monthly/i.test(node.textContent) && !node.disabled));
    await buy.click();
    await page.waitForFunction(() => window.__applicationFixture.beginCalls === 1);
    await page.evaluate(async () => { const fixture = window.__applicationFixture; fixture.unmount(); fixture.releasePurchase(); await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.equal(await page.evaluate(() => window.__applicationFixture.purchaseCalls), 0, `${kind} starts no checkout after unmount`);
    checks.push(`${kind} prevents provider checkout after pending setup outlives screen`);
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(artifacts, "result.json"), JSON.stringify({ engine, checks }, null, 2));
  console.log(`${checks.length} ${engine} application workflow checks passed. Artifacts: ${artifacts}`);
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
