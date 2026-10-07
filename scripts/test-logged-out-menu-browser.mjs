import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { build } from "esbuild";

const runFile = promisify(execFile);
const workspace = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const artifacts = path.join(workspace, ".tmp-tests", "logged-out-menu-browser");
const candidates = process.env.PLANTIE_TEST_BROWSER ? [process.env.PLANTIE_TEST_BROWSER]
  : ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"];
let browser;
for (const candidate of candidates) { try { await access(candidate); browser = candidate; break; } catch { /* Check installed locations. */ } }
assert.ok(browser, "No isolated Chromium executable found. Set PLANTIE_TEST_BROWSER.");
await mkdir(artifacts, { recursive: true });

// Replace the actual network/auth boundary, not the component, its validation,
// state, translations, version hook, navigation, or production stylesheet.
const authBoundary = `
const state = globalThis.__loggedOutMenuFixtureAuth = {calls: [], hold: false, release: null, failNext: false};
async function request(kind, email, password) {
  state.calls.push({kind, email: email ?? null, passwordLength: password?.length ?? 0});
  if (state.hold) await new Promise(resolve => { state.release = resolve; });
  if (state.failNext) { state.failNext = false; throw new Error("Synthetic auth boundary unavailable"); }
}
export const registerWithEmailPassword = (email, password) => request("register", email, password);
export const signInWithEmailPassword = (email, password) => request("login", email, password);
export const requestPasswordReset = email => request("reset", email);
export const signInWithGoogle = () => request("google");
export const updatePassword = (password) => request("update", undefined, password);
`;
await build({ absWorkingDir: workspace, entryPoints: ["tests/fixtures/logged-out-menu-browser.tsx"],
  outfile: path.join(artifacts, "fixture.js"), bundle: true, platform: "browser", format: "iife", jsx: "automatic",
  define: { "import.meta.env": "{}", "process.env.NODE_ENV": '"development"' }, logLevel: "warning",
  plugins: [{ name: "isolated-auth-boundary", setup(builder) {
    builder.onResolve({ filter: /(?:^|\/)authService(?:\.ts)?$/ }, () => ({ path: "auth", namespace: "menu-fixture" }));
    builder.onResolve({ filter: /(?:^|\/)supabase(?:\.ts)?$/ }, () => ({ path: "config", namespace: "menu-fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "menu-fixture" }, ({ path: name }) => ({ contents: name === "auth" ? authBoundary
      : 'export const isSupabaseConfigured = !new URLSearchParams(location.search).has("auth-unavailable"); export const supabase = null;', loader: "js" }));
  } }],
});
await writeFile(path.join(artifacts, "fixture.css"), await readFile(path.join(workspace, "src", "styles.css")));
await writeFile(path.join(artifacts, "fixture.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src data:"><title>Plantie logged-out Menu fixture</title><link rel="stylesheet" href="fixture.css"><style>html{scroll-behavior:auto}#logged-out-menu-browser-results{display:none}</style></head><body><div id="root"></div><pre id="logged-out-menu-browser-results">pending</pre><script src="fixture.js"></script></body></html>`);
const outerHtml = path.join(artifacts, "viewport.html");
await writeFile(outerHtml, `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src 'self'; script-src 'self'; style-src 'unsafe-inline'"><style>html,body{margin:0;height:100%;background:#f3efe7}body{display:flex;justify-content:center}iframe{max-width:100%;height:100vh;border:0}pre{display:none}</style></head><body><iframe id="fixture-frame" title="Isolated exact-width Menu fixture"></iframe><pre id="logged-out-menu-browser-results">pending</pre><script src="viewport.js"></script></body></html>`);
await writeFile(path.join(artifacts, "viewport.js"), `const frame=document.getElementById("fixture-frame");frame.style.width=new URLSearchParams(location.search).get("width")+"px";frame.src="fixture.html"+location.search;const mirror=()=>{const value=frame.contentDocument?.getElementById("logged-out-menu-browser-results")?.textContent;if(!value||value==="pending"){setTimeout(mirror,0);return}document.getElementById("logged-out-menu-browser-results").textContent=value};setTimeout(mirror,0);`);
const widths = [320, 390, 768, 1024, 1280, 1600];
const scenarios = widths.map(width => ({ width, scene: "account" }));
for (const width of [390, 1280]) for (const scene of ["household", "subscription", "language", "support", "about", "initial-household", "unavailable"])
  scenarios.push({ width, scene });
const requested = new Set(process.argv.slice(2));
const known = new Set(scenarios.map(({ width, scene }) => `${width}-${scene}`));
for (const name of requested) assert.ok(known.has(name), `Unknown fixture scenario: ${name}`);
const decode = value => value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
for (const { width, scene } of scenarios) {
  const name = `${width}-${scene}`;
  if (requested.size && !requested.has(name)) continue;
  const profile = await mkdtemp(path.join(artifacts, `profile-${name}-`));
  assert.equal(path.dirname(profile), artifacts, "Only a new isolated fixture profile may be removed.");
  try {
    const url = `${pathToFileURL(outerHtml).href}?width=${width}&scene=${scene}${scene === "unavailable" ? "&auth-unavailable=1" : ""}`;
    const { stdout } = await runFile(browser, ["--headless=new", "--no-first-run", "--no-default-browser-check",
      "--disable-background-networking", "--disable-component-update", "--disable-extensions", "--disable-sync",
      "--disable-features=Translate", "--metrics-recording-only", "--force-device-scale-factor=1", "--hide-scrollbars",
      // Windows headless browser chrome can subtract pixels from window-size.
      // The iframe owns the exact CSS width; leave room in its outer window.
      "--allow-file-access-from-files", `--user-data-dir=${profile}`, `--window-size=${Math.max(500, width + 64)},1050`,
      "--virtual-time-budget=15000", `--screenshot=${path.join(artifacts, `${name}.png`)}`, "--dump-dom", url],
    { windowsHide: true, timeout: 45000, maxBuffer: 4 * 1024 * 1024 });
    await writeFile(path.join(artifacts, `${name}.html`), stdout);
    const match = stdout.match(/<pre id="logged-out-menu-browser-results">([\s\S]*?)<\/pre>/);
    assert.ok(match && match[1] !== "pending", `${name}: fixture did not finish`);
    const result = JSON.parse(decode(match[1]));
    await writeFile(path.join(artifacts, `${name}.json`), `${JSON.stringify(result, null, 2)}\n`);
    assert.deepEqual(result.failures, [], `${name}: ${JSON.stringify(result.failures)}`);
    assert.equal(result.viewport.width, width, "Fixture must use the requested exact CSS viewport width.");
    assert.ok(result.checks.length >= (scene === "unavailable" ? 20 : 45), `${name}: fixture checks incomplete`);
    console.log(`${name}: ${result.checks.length} real DOM checks passed (${width} CSS pixels).`);
  } finally {
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
console.log(`Logged-out Menu fixture passed. Screenshots/results: ${path.relative(workspace, artifacts)}.`);
console.log("Real Menu/AuthPanel validation, component state, translations, web version, navigation and stylesheet; only auth/config boundaries substituted. Programmatic DOM events and exact-width local iframes, not live signup/email/OAuth, physical keyboard, native plugins, hardware safe areas, or complete App route verification.");
