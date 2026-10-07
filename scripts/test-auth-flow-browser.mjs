import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { build } from "esbuild";
import ts from "typescript";

const runFile = promisify(execFile);
const workspace = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const artifacts = path.join(workspace, ".tmp-tests", "auth-flow-browser");
// This structural assertion checks production wiring, not a live full-App
// navigation. Runtime recovery/event behavior is tested in the real hook below.
const appPath = path.join(workspace, "src", "App.tsx");
const app = ts.createSourceFile(appPath, await readFile(appPath, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const descendants = (node, predicate) => {
  const matches = [];
  const visit = current => { if (predicate(current)) matches.push(current); ts.forEachChild(current, visit); };
  visit(node); return matches;
};
const completion = descendants(app, node => ts.isVariableDeclaration(node) && node.name.getText(app) === "completeRecovery")[0]?.initializer;
assert.ok(completion && ts.isArrowFunction(completion) && ts.isBlock(completion.body), "Production recovery completion is missing.");
const completionStatements = completion.body.statements.map(node => node.getText(app));
const requiredCompletion = ["auth.beginPasswordRecoveryCompletion(", "await finishPasswordRecovery()", "auth.completePasswordRecovery(", "setAuthEntry", "window.location.hash"];
let previous = -1;
for (const fragment of requiredCompletion) {
  const index = completionStatements.findIndex(statement => statement.includes(fragment));
  assert.ok(index > previous, `Recovery must perform ${fragment} in the verified cleanup order.`); previous = index;
}
assert.ok(completionStatements.some(statement => statement.includes('mode: "login"') && statement.includes('key: "password_changed"')),
  "Confirmed recovery must enter Sign in with a memory-only success notice.");
assert.ok(completionStatements.some(statement => statement.includes("if (flowId === null) return"))
  && completionStatements.some(statement => statement.includes("if (!auth.completePasswordRecovery(flowId)) return")),
  "Production recovery must reject stale flow results before cleanup or login handoff.");
const guards = descendants(app, node => ts.isIfStatement(node));
const invalidGuard = guards.find(node => node.expression.getText(app) === "auth.invalidRecoveryLink");
const callbackGuard = guards.find(node => node.expression.getText(app) === "auth.callbackError");
const recoveryGuard = guards.find(node => node.expression.getText(app) === "auth.isPasswordRecovery");
assert.ok(invalidGuard && callbackGuard && recoveryGuard && invalidGuard.pos < callbackGuard.pos && callbackGuard.pos < recoveryGuard.pos,
  "Invalid recovery must be gated before generic callback errors and update fields.");
assert.equal(descendants(invalidGuard.thenStatement, node => (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node))
  && node.tagName.getText(app) === "AuthPanel").length, 0, "Production invalid recovery must not mount a usable AuthPanel.");
const recoveryPanel = descendants(recoveryGuard.thenStatement, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(app) === "AuthPanel")[0];
assert.ok(recoveryPanel?.attributes.properties.some(node => ts.isJsxAttribute(node) && node.name.getText(app) === "onPasswordUpdated"
  && node.initializer?.getText(app) === "{completeRecovery}"), "Recovery AuthPanel must await the verified completion handler.");
assert.ok(recoveryPanel?.attributes.properties.some(node => ts.isJsxAttribute(node) && node.name.getText(app) === "onRequestPasswordReset"
  && node.initializer?.getText(app) === "{requestNewRecoveryLink}"), "Recovery retry must use the shared safe reset handler.");
assert.ok(recoveryPanel?.attributes.properties.some(node => ts.isJsxAttribute(node) && node.name.getText(app) === "key"
  && node.initializer?.getText(app) === "{auth.recoveryFlowId}"), "New recovery flows must clear the previously mounted password form.");
const menu = descendants(app, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(app) === "LoggedOutMenu")[0];
for (const name of ["initialAuthMode", "initialAuthEmail", "initialAuthNotice", "onAuthNoticeConsumed"])
  assert.ok(menu?.attributes.properties.some(node => ts.isJsxAttribute(node) && node.name.getText(app) === name), `Production Menu is missing ${name} handoff wiring.`);
console.log("Production App recovery cleanup, invalid-link guard, callbacks and transient Menu handoff are wired correctly (structural check only).");
await mkdir(artifacts, { recursive: true });
const candidates = process.env.PLANTIE_TEST_BROWSER ? [process.env.PLANTIE_TEST_BROWSER]
  : ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"];
let browser;
for (const candidate of candidates) { try { await access(candidate); browser = candidate; break; } catch { /* Check installed locations. */ } }
assert.ok(browser, "No isolated Chromium executable found. Set PLANTIE_TEST_BROWSER.");

// Only true external boundaries are substituted. No actual signup, email,
// password update, OAuth, profile mutation, or session is sent to a provider.
const providerBoundary = `
const listeners = new Set();
const user = {id:"10000000-0000-4000-8000-000000000001",email:"fixture@example.invalid",email_confirmed_at:"2026-01-01T00:00:00Z",user_metadata:{}};
const session = {user,access_token:"synthetic-not-a-token",refresh_token:"synthetic-not-a-token",expires_at:Math.floor(Date.now()/1000)+3600};
const state = globalThis.__authFlowFixtureProvider = {calls:[],session:null,holdKind:null,release:null,errorNext:null,errorByKind:{},signupSession:false,sessionReadError:false,holdSession:false,releaseSession:null,emitInitial:false,events:[],listeners,
 seedSession(){state.session=session;return session;},
 emit(event,next=state.session){state.session=next;state.events.push(event);for(const listener of [...listeners])listener(event,next);}};
async function request(kind,input={}) {
 state.calls.push({kind,email:input.email??null,passwordLength:input.password?.length??0,redirect:input.options?.redirectTo??input.options?.emailRedirectTo??null,scope:input.scope??null});
 if(state.holdKind===kind){state.holdKind=null;await new Promise(resolve=>{state.release=()=>{state.release=null;resolve();};});}
 const error=state.errorByKind[kind]??state.errorNext;delete state.errorByKind[kind];state.errorNext=null;if(error)return {data:{user:null,session:null},error};
 if(kind==="login")state.emit("SIGNED_IN",session);
 if(kind==="update")state.emit("USER_UPDATED",state.session);
 if(kind==="signout")state.emit("SIGNED_OUT",null);
 return {data:{user,session:kind==="register"&&state.signupSession?session:null,url:"https://accounts.google.com/synthetic-fixture"},error:null};
}
export const isSupabaseConfigured=true;
export const supabase={auth:{
 onAuthStateChange(callback){listeners.add(callback);if(state.emitInitial)Promise.resolve().then(()=>{if(listeners.has(callback))callback("INITIAL_SESSION",state.session);});return {data:{subscription:{unsubscribe(){listeners.delete(callback);}}}};},
 async getSession(){const snapshot=state.session;if(state.holdSession){state.holdSession=false;await new Promise(resolve=>{state.releaseSession=()=>{state.releaseSession=null;resolve();};});}return {data:{session:snapshot},error:state.sessionReadError?{code:"network_error",message:"Synthetic session read failed"}:null};},
 async getUser(){return {data:{user:state.session?.user??null},error:null};},
 async exchangeCodeForSession(code){state.calls.push({kind:"exchange",email:null,passwordLength:0,redirect:null});
  if(!["synthetic-valid-recovery","synthetic-valid-oauth"].includes(code))return {error:{code:"otp_expired",message:"Synthetic expired callback"}};
  state.emit(code==="synthetic-valid-recovery"?"PASSWORD_RECOVERY":"SIGNED_IN",session);return {data:{session,user},error:null};},
 signUp:input=>request("register",input),signInWithPassword:input=>request("login",input),
 resetPasswordForEmail:(email,options)=>request("reset",{email,options}),
 signInWithOAuth:input=>request("google",input),signInWithOtp:input=>request("magic",input),
 updateUser:input=>request("update",input),signOut:input=>request("signout",input)},
 from(table){if(table!=="profiles")throw new Error("Unexpected fixture repository access");return {async upsert(){return {error:null};}};}};
`;
const nativeAppBoundary = `export const App={async addListener(){return {async remove(){}};},async getLaunchUrl(){return new URLSearchParams(location.search).get("scene")==="native-close-failure"?{url:"com.plantie.app://auth/recovery?code=synthetic-valid-recovery"}:null;},async getInfo(){return {version:"0.1.0"};}};`;
await build({ absWorkingDir: workspace, entryPoints: ["tests/fixtures/auth-flow-browser.tsx"],
  outfile: path.join(artifacts, "fixture.js"), bundle: true, platform: "browser", format: "iife", jsx: "automatic",
  define: { "import.meta.env": "{}", "process.env.NODE_ENV": '"development"' }, logLevel: "warning",
  plugins: [{ name: "auth-external-boundaries", setup(builder) {
    builder.onResolve({ filter: /(?:^|\/)supabase(?:\.ts)?$/ }, () => ({ path: "provider", namespace: "auth-fixture" }));
    builder.onResolve({ filter: /(?:^|\/)plantieRepository(?:\.ts)?$/ }, () => ({ path: "repository", namespace: "auth-fixture" }));
    builder.onResolve({ filter: /^@capacitor\/core$/ }, () => ({ path: "platform", namespace: "auth-fixture" }));
    builder.onResolve({ filter: /^@capacitor\/app$/ }, () => ({ path: "native-app", namespace: "auth-fixture" }));
    builder.onResolve({ filter: /^@capacitor\/browser$/ }, () => ({ path: "native-browser", namespace: "auth-fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "auth-fixture" }, ({ path: name }) => ({ contents: name === "provider" ? providerBoundary
      : name === "platform" ? 'const native=()=>new URLSearchParams(location.search).get("scene")==="native-close-failure"; export const Capacitor={isNativePlatform:native,getPlatform:()=>native()?"android":"web"};'
      : name === "native-app" ? nativeAppBoundary
      : name === "native-browser" ? 'throw new Error("Synthetic unavailable native Browser module"); export const Browser={async close(){}};'
      : "export const getUserHouseholds=async()=>[];", loader: "js" }));
  } }],
});
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src data:"><title>Plantie isolated auth fixture</title><link rel="stylesheet" href="/fixture.css"><style>html{scroll-behavior:auto}#auth-flow-browser-results{display:none}</style></head><body><div id="root"></div><pre id="auth-flow-browser-results">pending</pre><script src="/fixture.js"></script></body></html>`;
await writeFile(path.join(artifacts, "fixture.html"), html);
await writeFile(path.join(artifacts, "fixture.css"), await readFile(path.join(workspace, "src", "styles.css")));
const outer = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src 'self'; script-src 'self'; style-src 'unsafe-inline'"><style>html,body{margin:0;height:100%;background:#f3efe7}body{display:flex;justify-content:center}iframe{max-width:100%;height:100vh;border:0}pre{display:none}</style></head><body><iframe id="fixture-frame" title="Isolated exact-width auth fixture"></iframe><pre id="auth-flow-browser-results">pending</pre><script src="/viewport.js"></script></body></html>`;
const viewportScript = `const p=new URLSearchParams(location.search);const scene=p.get("scene");const frame=document.getElementById("fixture-frame");frame.style.width=p.get("width")+"px";const recovery=scene.startsWith("recovery-")&&!["recovery-restoration-failure","recovery-event-race","recovery-marker-timers"].includes(scene);frame.src=(scene==="marker-normal-callback"?"/auth/callback?code=synthetic-valid-oauth&":scene==="marker-failed-normal-callback"?"/auth/callback?code=synthetic-expired-oauth&":recovery?"/auth/recovery?code="+(scene==="recovery-invalid"?"synthetic-expired-recovery":"synthetic-valid-recovery")+"&":"/fixture?")+p.toString();const mirror=()=>{const value=frame.contentDocument?.getElementById("auth-flow-browser-results")?.textContent;if(!value||value==="pending"){setTimeout(mirror,0);return}document.getElementById("auth-flow-browser-results").textContent=value};setTimeout(mirror,0);`;
await writeFile(path.join(artifacts, "viewport.html"), outer);
await writeFile(path.join(artifacts, "viewport.js"), viewportScript);
const files = new Map([
  ["/fixture.js", ["text/javascript", await readFile(path.join(artifacts, "fixture.js"))]],
  ["/fixture.css", ["text/css", await readFile(path.join(artifacts, "fixture.css"))]],
  ["/viewport.js", ["text/javascript", viewportScript]],
]);
const server = createServer((request, response) => {
  const pathname = new URL(request.url, "http://127.0.0.1").pathname;
  const item = files.get(pathname) ?? (["/fixture", "/auth/recovery", "/auth/callback"].includes(pathname) ? ["text/html", html]
    : pathname === "/viewport" ? ["text/html", outer] : null);
  if (!item) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { "Content-Type": item[0], "Cache-Control": "no-store" }); response.end(item[1]);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const scenarios = [];
for (const width of [390, 1280]) for (const scene of ["modes", "invitation", "recovery-success", "recovery-failure", "recovery-invalid", "recovery-expired", "recovery-cleanup-failure", "recovery-restoration-failure", "standalone-success", "standalone-cleanup-failure"])
  scenarios.push({ width, scene });
for (const scene of ["marker-valid", "marker-expired", "marker-mismatched", "marker-malformed", "marker-normal-callback", "native-events"])
  scenarios.push({ width: 390, scene });
for (const scene of ["marker-failed-normal-callback", "recovery-event-race", "recovery-marker-timers", "recovery-flow-generation", "native-close-failure"])
  scenarios.push({ width: 390, scene });
for (const width of [390, 1280]) for (const scene of ["recovery-form-preview", "recovery-handoff-preview"])
  scenarios.push({ width, scene });
const requested = new Set(process.argv.slice(2));
const known = new Set(scenarios.map(({ width, scene }) => `${width}-${scene}`));
for (const name of requested) assert.ok(known.has(name), `Unknown fixture scenario: ${name}`);
const decode = value => value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
try {
  for (const { width, scene } of scenarios) {
    const name = `${width}-${scene}`;
    if (requested.size && !requested.has(name)) continue;
    const profile = await mkdtemp(path.join(artifacts, `profile-${name}-`));
    assert.equal(path.dirname(profile), artifacts, "Only a new isolated fixture profile may be removed.");
    try {
      const { stdout } = await runFile(browser, ["--headless=new", "--no-first-run", "--no-default-browser-check",
        "--disable-background-networking", "--disable-component-update", "--disable-extensions", "--disable-sync",
        "--disable-features=Translate", "--metrics-recording-only", "--force-device-scale-factor=1", "--hide-scrollbars",
        `--user-data-dir=${profile}`, `--window-size=${Math.max(500, width + 64)},1050`, "--virtual-time-budget=15000",
        `--screenshot=${path.join(artifacts, `${name}.png`)}`, "--dump-dom", `${origin}/viewport?width=${width}&scene=${scene}`],
      { windowsHide: true, timeout: 45000, maxBuffer: 4 * 1024 * 1024 });
      await writeFile(path.join(artifacts, `${name}.html`), stdout);
      const match = stdout.match(/<pre id="auth-flow-browser-results">([\s\S]*?)<\/pre>/);
      assert.ok(match && match[1] !== "pending", `${name}: fixture did not finish`);
      const result = JSON.parse(decode(match[1]));
      await writeFile(path.join(artifacts, `${name}.json`), `${JSON.stringify(result, null, 2)}\n`);
      assert.deepEqual(result.failures, [], `${name}: ${JSON.stringify(result.failures)}`);
      assert.equal(result.viewport.width, width, "Fixture must use the requested exact CSS viewport width.");
      assert.ok(result.checks.length >= 10, `${name}: fixture checks incomplete`);
      console.log(`${name}: ${result.checks.length} real DOM/hook checks passed (${width} CSS pixels).`);
    } finally {
      await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
console.log(`Auth flow fixture passed. Screenshots/results: ${path.relative(workspace, artifacts)}.`);
console.log("Real AuthPanel, useAuth, auth service/rules, redirect helpers and stylesheet; only Supabase/profile repository boundaries substituted. Parent handoff and provider auth events are synthetic. No actual email, signup, OAuth, password update, native plugin, software keyboard, or full App session transition exercised.");
