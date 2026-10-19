import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";

const output = ".tmp-tests/backend-timeout.mjs";
await build({ entryPoints: ["src/lib/backendConfig.ts"], outfile: output, bundle: true, platform: "node", format: "esm", packages: "external",
  define: { "import.meta.env": JSON.stringify({ VITE_BACKEND_PROVIDER: "netlify" }) }, logLevel: "silent" });
const { callBackendFunction } = await import(pathToFileURL(`${process.cwd()}/${output}`).href);
test("request cancellation still settles after headers while the response body stalls", async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  let release;
  let reading;
  const bodyStarted = new Promise(resolve => { reading = resolve; });
  globalThis.fetch = async () => ({ ok: true, json: () => { reading(); return new Promise(resolve => { release = resolve; }); } });
  let failure;
  try {
    const operation = callBackendFunction({ functionName: "delete-account-request", netlifyPath: "/fixture", signal: controller.signal });
    void operation.catch(error => { failure = error; });
    await bodyStarted;
    controller.abort();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(failure?.name, "AbortError");
    release({});
    await assert.rejects(operation, { name: "AbortError" });
  } finally { release?.({}); globalThis.fetch = original; }
});
