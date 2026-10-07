import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { build } from "esbuild";

const runFile = promisify(execFile);
// Isolated hidden development fixture; no existing user browser profile is used.
const workspace = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const artifacts = path.join(workspace, ".tmp-tests", "billing-history-browser");
const candidates = process.env.PLANTIE_TEST_BROWSER ? [process.env.PLANTIE_TEST_BROWSER] : ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"];
let browser;
for (const candidate of candidates) { try { await access(candidate); browser = candidate; break; } catch { /* Check installed locations. */ } }
assert.ok(browser, "No isolated Chromium executable found. Set PLANTIE_TEST_BROWSER.");
await mkdir(artifacts, { recursive: true });
// Development React exercises StrictMode effect replay in the real history hook.
await build({ absWorkingDir: workspace, entryPoints: ["tests/fixtures/billing-history-browser.tsx"], outfile: path.join(artifacts, "fixture.js"), bundle: true, platform: "browser", format: "iife", jsx: "automatic", define: { "import.meta.env": "{}", "process.env.NODE_ENV": '"development"' }, logLevel: "warning" });
await writeFile(path.join(artifacts, "fixture.css"), await readFile(path.join(workspace, "src", "styles.css")));
const html = path.join(artifacts, "fixture.html");
await writeFile(html, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src data:"><title>Plantie billing history fixture</title><link rel="stylesheet" href="fixture.css"><style>html{scroll-behavior:auto}.fixture-shell{max-width:880px;margin:24px auto 0;padding:0 20px}.fixture-before-history{height:220px}.fixture-shell .pricing-page{background:#f8fbf8}#billing-history-browser-results{display:none}</style></head><body><div id="root"></div><pre id="billing-history-browser-results">pending</pre><script src="fixture.js"></script></body></html>`);
const mobileHtml = path.join(artifacts, "mobile-fixture.html");
await writeFile(mobileHtml, `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src 'self'; script-src 'self'; style-src 'unsafe-inline'"><style>html,body{margin:0;height:100%;background:#f3efe7}body{display:flex;justify-content:center}iframe{width:390px;max-width:100%;height:100vh;border:0}pre{display:none}</style></head><body><iframe id="fixture-frame" title="390px billing history fixture"></iframe><pre id="billing-history-browser-results">pending</pre><script src="mobile-fixture.js"></script></body></html>`);
await writeFile(path.join(artifacts, "mobile-fixture.js"), `const frame=document.getElementById("fixture-frame");frame.src="fixture.html"+location.search;const mirror=()=>{const value=frame.contentDocument?.getElementById("billing-history-browser-results")?.textContent;if(!value||value==="pending"){setTimeout(mirror,0);return}document.getElementById("billing-history-browser-results").textContent=value};setTimeout(mirror,0);`);
const decode = (value) => value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
// Optional named scenarios make an isolated failing fixture quick to reproduce.
const requestedScenarios = new Set(process.argv.slice(2));
const knownScenarios = new Set(["desktop", "mobile"].flatMap((viewport) => ["first", "middle", "last", "bottom", "empty", "loading", "error", "reduced-motion"].map((scene) => `${viewport}-${scene}`)));
for (const scenario of requestedScenarios) assert.ok(knownScenarios.has(scenario), `Unknown fixture scenario: ${scenario}`);
for (const viewport of [{ name: "desktop", width: 1280, height: 1050 }, { name: "mobile", width: 500, height: 1000 }]) {
  for (const scene of ["first", "middle", "last", "bottom", "empty", "loading", "error", "reduced-motion"]) {
    const reducedMotion = scene === "reduced-motion";
    const name = `${viewport.name}-${scene}`;
    if (requestedScenarios.size && !requestedScenarios.has(name)) continue;
    const profile = await mkdtemp(path.join(artifacts, `profile-${name}-`));
    assert.equal(path.dirname(profile), artifacts, "Only a new isolated fixture profile may be removed.");
    try {
      const { stdout } = await runFile(browser, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "--disable-extensions", "--disable-sync", "--disable-features=Translate", "--metrics-recording-only", "--force-device-scale-factor=1", "--hide-scrollbars", "--allow-file-access-from-files", ...(reducedMotion ? ["--force-prefers-reduced-motion"] : []), `--user-data-dir=${profile}`, `--window-size=${viewport.width},${viewport.height}`, "--virtual-time-budget=10000", `--screenshot=${path.join(artifacts, `${name}.png`)}`, "--dump-dom", `${pathToFileURL(viewport.name === "mobile" ? mobileHtml : html).href}?scene=${reducedMotion ? "first" : scene}`], { windowsHide: true, timeout: 45000, maxBuffer: 4 * 1024 * 1024 });
      await writeFile(path.join(artifacts, `${name}.html`), stdout);
      const match = stdout.match(/<pre id="billing-history-browser-results">([\s\S]*?)<\/pre>/);
      assert.ok(match && match[1] !== "pending", `${name}: fixture did not finish`);
      const result = JSON.parse(decode(match[1]));
      await writeFile(path.join(artifacts, `${name}.json`), `${JSON.stringify(result, null, 2)}\n`);
      assert.deepEqual(result.failures, [], `${name}: ${JSON.stringify(result.failures)}`);
      assert.ok(result.checks.length >= 35, `${name}: fixture checks incomplete`);
      assert.equal(result.mobile, viewport.name === "mobile");
      if (result.mobile) assert.equal(result.viewport.width, 390, "Mobile fixture must be 390 CSS pixels.");
      if (reducedMotion) assert.equal(result.reducedMotion, true, "Reduced-motion scenario must use the browser preference.");
      console.log(`${name}: ${result.checks.length} DOM checks passed (${result.viewport.width} x ${result.viewport.height}, reduced motion: ${result.reducedMotion}).`);
    } finally {
      await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }
}
console.log(`Billing history fixture passed. Screenshots/results: ${path.relative(workspace, artifacts)}.`);
console.log("Actual StrictMode history hook/model/timeline/navigation with repository/auth boundaries substituted; programmatic clicks/focus/touch events, no trusted keyboard/device gestures or live App/backend verification is claimed.");
