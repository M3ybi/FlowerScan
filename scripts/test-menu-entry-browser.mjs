import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { build } from "esbuild";
import { chromium, webkit } from "playwright";

const engine = process.argv.includes("--webkit") ? "webkit" : "chromium";
const reproduce = process.argv.includes("--reproduce");
const artifacts = path.resolve(`.tmp-tests/menu-entry-${engine}`);
await mkdir(artifacts, { recursive: true });
await build({ entryPoints: ["tests/fixtures/menu-entry-browser.tsx"], outdir: artifacts, entryNames: "fixture", bundle: true, splitting: true,
  format: "esm", jsx: "automatic", platform: "browser", logLevel: "warning",
  define: { "import.meta.env": JSON.stringify({ VITE_BACKEND_PROVIDER: "netlify", VITE_ENABLE_LEGACY_NETLIFY_BACKEND: "true", VITE_SUPABASE_URL: "https://fixture.example.invalid", VITE_SUPABASE_ANON_KEY: "fixture-public-key", VITE_DISABLE_SUPABASE_READS: "true" }) },
  plugins: [{ name: "offline-auth-service", setup(builder) {
    builder.onResolve({ filter: /\/authService(?:\.js|\.ts)?$/ }, () => ({ path: path.resolve("tests/fixtures/application-auth-boundary.ts") }));
  } }],
});
await writeFile(path.join(artifacts, "index.html"), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>');
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const name = pathname === "/" || pathname === "/index.html" || pathname.startsWith("/auth/") ? "index.html" : pathname.slice(1);
  if (!/^[\w.-]+$/.test(name)) { response.writeHead(404).end(); return; }
  try {
    response.setHeader("Content-Type", name.endsWith(".js") ? "text/javascript" : name.endsWith(".css") ? "text/css" : "text/html");
    response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'");
    response.end(await readFile(name === "styles.css" ? "src/styles.css" : path.join(artifacts, name)));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const checks = [], failures = [];
const renderedContrast = async (page, tagline, metrics) => {
  const originalColor = await tagline.evaluate(element => { const color = element.style.color; element.style.color = "transparent"; return color; });
  let raster;
  try { raster = await tagline.screenshot({ animations: "disabled" }); }
  finally { await tagline.evaluate((element, color) => { element.style.color = color; }, originalColor); }
  return page.evaluate(async ({ encoded, metrics }) => {
    const image = new Image(); image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    const luminance = rgb => rgb.map(value => { const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; })
      .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const foreground = luminance(metrics.color.match(/[\d.]+/g).slice(0, 3).map(Number));
    let minimum = Infinity, sampledPixels = 0;
    for (const rect of metrics.textBounds) {
      for (let y = Math.max(0, Math.ceil(rect.top - metrics.bounds.top)); y < Math.min(image.height, Math.floor(rect.bottom - metrics.bounds.top)); y++) {
        for (let x = Math.max(0, Math.ceil(rect.left - metrics.bounds.left)); x < Math.min(image.width, Math.floor(rect.right - metrics.bounds.left)); x++) {
          const offset = (y * image.width + x) * 4;
          const background = luminance([pixels[offset], pixels[offset + 1], pixels[offset + 2]]);
          minimum = Math.min(minimum, (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05));
          sampledPixels++;
        }
      }
    }
    return { minimum, sampledPixels };
  }, { encoded: raster.toString("base64"), metrics });
};
const scenario = async (name, run, viewport = { width: 390, height: 844 }) => {
  const page = await browser.newPage({ viewport });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  page.setDefaultTimeout(6000);
  try { await run(page); assert.deepEqual(errors, []); checks.push(name); console.log(`PASS: ${name}`); }
  catch (error) { failures.push({ name, error: error.message }); console.error(`FAIL: ${name}: ${error.message}`); await page.screenshot({ path: path.join(artifacts, `${name}.png`), fullPage: true }); }
  finally { await page.close(); }
};
try {
  let executablePath;
  if (engine === "chromium") for (const candidate of [process.env.PLANTIE_TEST_BROWSER, "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].filter(Boolean)) {
    try { await access(candidate); executablePath = candidate; break; } catch {}
  }
  browser = await (engine === "webkit" ? webkit : chromium).launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  await scenario("root-entry", async page => {
    await page.goto(`${origin}/?fresh&hold-auth`);
    await page.locator('[aria-busy="true"]').first().waitFor();
    assert.equal(new URL(page.url()).hash, "");
    assert.equal(await page.locator("#access-title,#language-title,#welcome-title,#household-title").count(), 0);
    const historyLength = await page.evaluate(() => history.length);
    await page.evaluate(() => window.__entryFixtureAuth.release());
    await page.locator(".menu-hub-account input[type=email]").waitFor();
    assert.equal(new URL(page.url()).hash, "#/menu?section=account");
    assert.equal(await page.evaluate(() => history.length), historyLength);
    assert.deepEqual(await page.evaluate(() => window.__entryFixture.observedLegacyScreens), []);
    await page.reload(); await page.evaluate(() => window.__entryFixtureAuth.release());
    await page.locator(".menu-hub-account input[type=email]").waitFor();
    assert.equal(new URL(page.url()).hash, "#/menu?section=account");
    assert.equal(await page.evaluate(() => history.length), historyLength);
  });
  await scenario("fixed-account", async page => {
    await page.goto(`${origin}/?language=en&legacy-household#/menu?section=account`);
    const account = page.locator('[data-section="account"]');
    await account.locator("input[type=email]").waitFor();
    assert.equal(await account.locator(".menu-hub-section-header button,button.menu-hub-section-header").count(), 0);
    await account.getByRole("heading", { name: "Account", exact: true }).click();
    await account.locator("input[type=email]").fill("retained@example.test");
    const section = name => page.locator(`[data-section="${name}"]`);
    for (const name of ["language", "about", "support"]) {
      const button = section(name).locator("button.menu-hub-section-header");
      await button.focus(); await page.keyboard.press("Enter");
      assert.equal(await button.getAttribute("aria-expanded"), "true");
      assert.equal(await page.locator('.menu-hub-information button.menu-hub-section-header[aria-expanded="true"]').count(), 1);
      assert.equal(await account.locator("input[type=email]").inputValue(), "retained@example.test");
      assert.equal(await account.locator("input[type=email]").isVisible(), true);
    }
    await section("support").locator("button.menu-hub-section-header").press("Space");
    assert.equal(await page.locator('.menu-hub-information button.menu-hub-section-header[aria-expanded="true"]').count(), 0);
    await page.locator(".menu-hub-auth-state").click();
    assert.equal(await account.getByRole("heading", { name: "Account", exact: true }).evaluate(element => element === document.activeElement), true);
  });
  const widths = reproduce ? [1440] : [320, 375, 390, 430, 768, 1024, 1440];
  for (const language of reproduce ? ["sk"] : ["en", "sk", "de", "fr", "es"]) for (const width of widths) await scenario(`hero-${language}-${width}`, async page => {
    await page.goto(`${origin}/?language=${language}&legacy-household#/menu?section=account`);
    await page.locator(".menu-hub-account input[type=email]").waitFor();
    const tagline = page.locator(".menu-hub-hero-garden > span");
    assert.equal(await tagline.isVisible(), true, "Tagline is hidden");
    const metrics = await tagline.evaluate(element => {
      const bounds = element.getBoundingClientRect(), style = getComputedStyle(element);
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT), textBounds = [];
      while (walker.nextNode()) {
        if (!walker.currentNode.textContent.trim()) continue;
        const range = document.createRange(); range.selectNodeContents(walker.currentNode);
        textBounds.push(...Array.from(range.getClientRects()).map(rect => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom })));
      }
      return { bounds: bounds.toJSON(), textBounds, color: style.color, background: style.backgroundImage, text: element.textContent,
        overflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    assert.equal(metrics.overflow, false);
    assert.ok(metrics.textBounds.every(rect => rect.left >= metrics.bounds.left - 1 && rect.right <= metrics.bounds.right + 1 && rect.bottom <= metrics.bounds.bottom + 1), "Tagline clips or overflows");
    assert.ok(metrics.text.length > 0);
    if (language === "sk") assert.equal(metrics.text, "Jednoduchá starostlivosť o rastliny.");
    if (language === "en") assert.equal(metrics.text, "Simple plant care.");
    assert.notEqual(metrics.background, "none", "Leaves have no contrast layer behind text");
    metrics.contrast = await renderedContrast(page, tagline, metrics);
    assert.ok(metrics.contrast.sampledPixels > 0 && metrics.contrast.minimum >= 4.5, `Rendered text contrast is ${metrics.contrast.minimum}:1`);
    await page.screenshot({ path: path.join(artifacts, `hero-${language}-${width}.png`), fullPage: true });
    await writeFile(path.join(artifacts, `hero-${language}-${width}.json`), JSON.stringify(metrics, null, 2));
  }, { width, height: 1000 });
  if (!reproduce) {
    for (const entry of ["/#/", "/index.html", "/?legacy-household#/"]) await scenario(`root-alias-${encodeURIComponent(entry)}`, async page => {
      await page.goto(`${origin}${entry}`); await page.locator(".menu-hub-account input[type=email]").waitFor();
      assert.equal(new URL(page.url()).hash, "#/menu?section=account");
      assert.deepEqual(await page.evaluate(() => window.__entryFixture.observedLegacyScreens), []);
    });
    for (const name of ["household", "subscription", "language", "support", "about"]) await scenario(`section-${name}`, async page => {
      await page.goto(`${origin}/?fresh#/menu?section=${name}`); await page.locator(".menu-hub-account input[type=email]").waitFor();
      assert.equal(await page.locator(`[data-section="${name}"] > button`).getAttribute("aria-expanded"), "true");
      await page.evaluate(() => { location.hash = "/menu?section=account"; });
      await page.waitForFunction(() => document.querySelectorAll('.menu-hub-information button[aria-expanded="true"]').length === 0);
      assert.equal(await page.locator(".menu-hub-account input[type=email]").isVisible(), true);
    });
    await scenario("auth-transitions", async page => {
      await page.goto(`${origin}/?signed-in#/menu?section=household`);
      await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
      const account = page.locator(".menu-account-section");
      assert.equal(await account.locator("summary").count(), 0);
      const settings = page.locator("details.menu-section").filter({ has: page.getByText("Settings", { exact: true }) });
      await settings.locator("summary").press("Enter");
      assert.equal(await page.locator("details.menu-section[open]").count(), 1);
      assert.equal(await account.getByRole("button", { name: "Sign out", exact: true }).isVisible(), true);
      await page.evaluate(() => window.__entryFixtureAuth.setAuthenticated(false));
      await page.locator(".menu-hub-account input[type=email]").waitFor();
      assert.equal(await page.locator('[data-section="household"] > button').getAttribute("aria-expanded"), "true");
      await page.evaluate(() => window.__entryFixtureAuth.setAuthenticated(true));
      await page.locator(".menu-account-section").getByRole("button", { name: "Sign out", exact: true }).waitFor();
    });
    await scenario("authenticated-root", async page => {
      await page.goto(`${origin}/?signed-in#/`); await page.locator(".app-tab-nav").waitFor({ state: "attached" });
      assert.equal(new URL(page.url()).hash, "#/");
      assert.equal(await page.locator(".menu-hub").count(), 0);
    });
    for (const hash of ["#/privacy", "#/join?invitation=33333333-3333-4333-8333-333333333333", "#/flower/fixture-plant?panel=diagnostics"]) await scenario(`deep-link-${encodeURIComponent(hash)}`, async page => {
      await page.goto(`${origin}/?fresh${hash}`); await page.locator("main").waitFor();
      await page.waitForFunction(() => !document.querySelector('.household-loading-panel[aria-busy="true"]'));
      assert.equal(new URL(page.url()).hash, hash);
    });
    for (const kind of ["callback", "recovery"]) await scenario(`auth-${kind}`, async page => {
      await page.goto(`${origin}/auth/${kind}?code=fixture-${kind}`);
      await page.locator(kind === "recovery" ? "#password-recovery-title" : ".menu-account-section").waitFor();
      if (kind === "recovery") assert.equal(await page.getByRole("tab").count(), 0);
      assert.deepEqual(await page.evaluate(() => window.__entryFixture.observedLegacyScreens), []);
    });
    await scenario("back-navigation", async page => {
      await page.goto(`${origin}/?fresh#/privacy`); await page.locator("main").waitFor();
      await page.evaluate(() => { location.hash = "/"; });
      await page.locator(".menu-hub-account input[type=email]").waitFor();
      await page.goBack(); assert.equal(new URL(page.url()).hash, "#/privacy");
      await page.goForward(); await page.locator(".menu-hub-account input[type=email]").waitFor();
      assert.equal(new URL(page.url()).hash, "#/menu?section=account");
    });
  }
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
await writeFile(path.join(artifacts, "results.json"), JSON.stringify({ engine, checks, failures, limitations: "Offline auth/network boundaries; no real login, messages, purchases, or physical device acceptance." }, null, 2));
assert.deepEqual(failures, [], `${failures.length} menu/entry regressions failed`);
console.log(`${checks.length} ${engine} real App entry/menu/hero scenarios passed.`);
