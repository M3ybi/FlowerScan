import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { build } from "esbuild";

// This is a standalone development fixture, never an existing browser profile.
// DOM events are dispatched by the fixture; this does not emulate trusted input.
const runFile = promisify(execFile);
const workspace = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const artifactDirectory = path.join(workspace, ".tmp-tests", "invitation-center-browser");
const edgeCandidates = process.env.PLANTIE_TEST_BROWSER
  ? [process.env.PLANTIE_TEST_BROWSER]
  : [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ];

let edge;
for (const candidate of edgeCandidates) {
  try { await access(candidate); edge = candidate; break; } catch { /* Try the next installed location. */ }
}
assert.ok(edge, "No isolated headless browser found. Set PLANTIE_TEST_BROWSER to an installed Chromium executable.");
await mkdir(artifactDirectory, { recursive: true });
await build({
  absWorkingDir: workspace,
  entryPoints: ["tests/fixtures/invitation-center-browser.tsx"],
  outfile: path.join(artifactDirectory, "fixture.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  define: { "import.meta.env": "{}", "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
await writeFile(path.join(artifactDirectory, "fixture.css"), await readFile(path.join(workspace, "src", "styles.css")));
const htmlPath = path.join(artifactDirectory, "fixture.html");
await writeFile(htmlPath, `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'">
<title>Plantie invitation center DOM integration fixture</title><link rel="stylesheet" href="fixture.css">
<style>.fixture-shell{max-width:1100px;margin:24px auto;padding:0 20px}.fixture-shell .hero{display:flex;align-items:center;justify-content:space-between;height:96px;min-height:0;overflow:hidden;padding:20px}.fixture-shell h1{font-size:26px;margin:0}.fixture-shell .fixture-content{padding:28px 0}.fixture-shell output{display:block}#invitation-center-browser-results{display:none}</style>
</head><body><div id="root"></div><pre id="invitation-center-browser-results">pending</pre><script src="fixture.js"></script></body></html>`);
const mobileHtmlPath = path.join(artifactDirectory, "mobile-fixture.html");
await writeFile(mobileHtmlPath, `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Narrow invitation center fixture</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src 'self'; script-src 'self'; style-src 'unsafe-inline'">
<style>html,body{margin:0;height:100%;background:#f3efe7}body{display:flex;justify-content:center}iframe{width:390px;max-width:100%;height:100vh;border:0}pre{display:none}</style>
</head><body><iframe id="fixture-frame" title="Plantie mobile invitation center fixture"></iframe><pre id="invitation-center-browser-results">pending</pre><script src="mobile-fixture.js"></script></body></html>`);
await writeFile(path.join(artifactDirectory, "mobile-fixture.js"), `
const frame = document.getElementById("fixture-frame");
frame.src = "fixture.html" + location.search;
const mirrorResults = () => {
  const result = frame.contentDocument?.getElementById("invitation-center-browser-results");
  if (!result || result.textContent === "pending") { setTimeout(mirrorResults, 0); return; }
  document.getElementById("invitation-center-browser-results").textContent = result.textContent;
};
setTimeout(mirrorResults, 0);
`);

const decodeHtml = (value) => value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
// Windows Edge enforces a minimum outer window. The mobile fixture therefore
// runs in a local 390 px iframe; both runs report their actual inner viewport.
const scenarios = [{ name: "desktop", width: 1280, height: 900 }, { name: "mobile", width: 500, height: 844 }]
  .flatMap((viewport) => ["inbox", "details", "accepted"].map((scene) => ({ viewport, scene })));
for (const { viewport, scene } of scenarios) {
  const artifactName = scene === "inbox" ? viewport.name : `${viewport.name}-${scene}`;
  const profile = await mkdtemp(path.join(artifactDirectory, `profile-${artifactName}-`));
  const screenshot = path.join(artifactDirectory, `${artifactName}.png`);
  assert.equal(path.dirname(profile), artifactDirectory, "Fixture profile must stay inside its artifact directory.");
  try {
    const { stdout } = await runFile(edge, [
      "--headless=new", "--no-first-run", "--no-default-browser-check",
      "--disable-background-networking", "--disable-component-update", "--disable-extensions",
      "--disable-sync", "--disable-features=Translate", "--metrics-recording-only",
      "--force-device-scale-factor=1", "--hide-scrollbars", "--allow-file-access-from-files",
      `--user-data-dir=${profile}`, `--window-size=${viewport.width},${viewport.height}`,
      "--virtual-time-budget=10000", `--screenshot=${screenshot}`, "--dump-dom",
      `${pathToFileURL(viewport.name === "mobile" ? mobileHtmlPath : htmlPath).href}?viewport=${viewport.name}&scene=${scene}`,
    ], { windowsHide: true, timeout: 45000, maxBuffer: 4 * 1024 * 1024 });
    await writeFile(path.join(artifactDirectory, `${artifactName}.html`), stdout);
    const match = stdout.match(/<pre id="invitation-center-browser-results">([\s\S]*?)<\/pre>/);
    assert.ok(match, `${artifactName}: missing fixture results; inspect ${artifactName}.html`);
    assert.notEqual(match[1], "pending", `${artifactName}: fixture did not finish; inspect ${artifactName}.html`);
    const result = JSON.parse(decodeHtml(match[1]));
    await writeFile(path.join(artifactDirectory, `${artifactName}.json`), `${JSON.stringify(result, null, 2)}\n`);
    assert.deepEqual(result.failures, [], `${artifactName}: ${JSON.stringify(result.failures)}`);
    assert.ok(result.checks.length >= 28, `${artifactName}: fixture stopped before completing meaningful checks`);
    assert.equal(result.mobile, viewport.name === "mobile", `${viewport.name}: unexpected CSS viewport`);
    if (viewport.name === "mobile") assert.equal(result.viewport.width, 390, "Mobile fixture must use a real narrow CSS viewport.");
    assert.equal(result.scene, scene, `${artifactName}: unexpected screenshot scene`);
    console.log(`${artifactName}: ${result.checks.length} fixture DOM checks passed (${result.viewport.width} x ${result.viewport.height}).`);
  } finally {
    // Only delete the fresh profile created by this runner, never browser/user data.
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
console.log(`Fixture DOM integration passed. Screenshots/results: ${path.relative(workspace, artifactDirectory)}.`);
console.log("Programmatic DOM/keyboard events; no trusted-input or live App/backend verification is claimed.");
