import { webcrypto } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { build } from "esbuild";

const bundled = await build({ entryPoints: ["supabase/functions/send-test-email/index.ts"], bundle: true, write: false, format: "iife", plugins: [{
  name: "external-mail-auth-boundaries", setup(builder) {
    builder.onResolve({ filter: /\/auth\.ts$/ }, () => ({ path: "auth", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents:
      "export const requireUser = async () => globalThis.boundary.auth;" }));
  },
}] });
const invoke = async ({ enabled, operator = false, signedIn = true, denied = false, fail = false, networkFail = false } = {}) => {
  let handler;
  let sent = 0;
  let delivery;
  const env = { ENABLE_TEST_EMAIL: enabled, TEST_EMAIL_OPERATOR_IDS: operator ? "operator" : "", RESEND_API_KEY: "synthetic", RESEND_TEST_EMAIL: "test@example.invalid" };
  vm.runInNewContext(bundled.outputFiles[0].text, { crypto: webcrypto, console: { info() {} },
    Deno: { env: { get: key => env[key] }, serve: value => { handler = value; } }, Response, Headers, AbortSignal,
    fetch: async (url, options) => {
      sent++;
      delivery = { url, recipient: JSON.parse(options.body).to, bounded: options.signal instanceof AbortSignal };
      if (networkFail) throw new Error("private transport detail");
      return new Response(JSON.stringify(fail ? { error: "provider detail" } : { id: "sent" }), { status: fail ? 500 : 200 });
    },
    boundary: { auth: signedIn ? { user: { id: "operator" }, client: { rpc: async () => ({ error: denied ? {} : null }) } } : null,
    },
  });
  const response = await handler(new Request("https://fixture.invalid", { method: "POST" }));
  return { status: response.status, payload: await response.json(), sent, delivery };
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

test("operator mail bounds transport and retains its server-selected destination", async () => {
  const success = await invoke({ enabled: "true", operator: true });
  assert.deepEqual(success.delivery, { url: "https://api.resend.com/emails", recipient: "test@example.invalid", bounded: true });
  assert.equal(success.payload.id, "sent");
  const failure = await invoke({ enabled: "true", operator: true, networkFail: true });
  assert.equal(failure.status, 502);
  assert.doesNotMatch(JSON.stringify(failure.payload), /private transport detail/);
});
