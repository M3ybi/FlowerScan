import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { build } from "esbuild";

const bundled = await build({ entryPoints: ["supabase/functions/send-test-email/index.ts"], bundle: true, write: false, format: "iife", plugins: [{
  name: "external-mail-auth-boundaries", setup(builder) {
    builder.onResolve({ filter: /^npm:resend$/ }, () => ({ path: "mail", namespace: "fixture" }));
    builder.onResolve({ filter: /\/auth\.ts$/ }, () => ({ path: "auth", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: path === "auth"
      ? "export const requireUser = async () => globalThis.boundary.auth;"
      : "export class Resend { emails = { send: input => globalThis.boundary.send(input) }; }" }));
  },
}] });
const invoke = async ({ enabled, operator = false, signedIn = true, denied = false, fail = false } = {}) => {
  let handler;
  let sent = 0;
  const env = { ENABLE_TEST_EMAIL: enabled, TEST_EMAIL_OPERATOR_IDS: operator ? "operator" : "", RESEND_API_KEY: "synthetic", RESEND_TEST_EMAIL: "test@example.invalid" };
  vm.runInNewContext(bundled.outputFiles[0].text, {
    Deno: { env: { get: key => env[key] }, serve: value => { handler = value; } }, Response,
    boundary: { auth: signedIn ? { user: { id: "operator" }, client: { rpc: async () => ({ error: denied ? {} : null }) } } : null,
      send: async () => { sent++; return fail ? { error: { private: "provider detail" } } : { data: { id: "sent" } }; } },
  });
  const response = await handler(new Request("https://fixture.invalid", { method: "POST" }));
  return { status: response.status, payload: await response.json(), sent };
};

test("test mail defaults off and requires operator authorization plus admission", async () => {
  for (const [options, status] of [[{}, 404], [{ enabled: "true", signedIn: false }, 401],
    [{ enabled: "true" }, 403], [{ enabled: "true", operator: true, denied: true }, 429]]) {
    const response = await invoke(options);
    assert.equal(response.status, status);
    assert.equal(response.sent, 0);
  }
  assert.equal((await invoke({ enabled: "true", operator: true })).status, 202);
  const failure = await invoke({ enabled: "true", operator: true, fail: true });
  assert.equal(failure.status, 502);
  assert.doesNotMatch(JSON.stringify(failure.payload), /provider detail/);
});
