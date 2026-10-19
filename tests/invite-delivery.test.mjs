import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { build } from "esbuild";

const inviteId = "11111111-1111-4111-8111-111111111111";
const bundle = await build({ entryPoints: ["supabase/functions/send-household-invite-email/index.ts"], bundle: true, write: false, format: "iife", plugins: [{
  name: "auth-boundary", setup(builder) {
    builder.onResolve({ filter: /\/auth\.ts$/ }, () => ({ path: "auth", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const requireUser = async () => globalThis.boundary.auth;" }));
  },
}] });
const setup = ({ signedIn = true, allowed = true, denied = false, fail = false } = {}) => {
  let handler;
  const sends = [];
  const calls = [];
  const delivery = { invite_id: inviteId, household_id: inviteId, household_name: "Fixture", invitee_email: "recipient@example.invalid", token: "A".repeat(43), expires_at: "2027-01-01T00:00:00Z" };
  const env = { RESEND_API_KEY: "synthetic", RESEND_FROM_EMAIL: "Plantie <sender@example.invalid>", APP_PUBLIC_URL: "https://fixture.invalid" };
  vm.runInNewContext(bundle.outputFiles[0].text, {
    Deno: { env: { get: key => env[key] }, serve: fn => { handler = fn; } }, Response, AbortSignal,
    URL, Date: class extends Date { static now() { return 1792350000000; } }, console: { error() {} },
    boundary: { auth: signedIn ? { user: { email: "owner@example.invalid" }, client: { rpc: (name, args) => {
      calls.push(name);
      if (name === "get_household_invite_delivery") {
        assert.equal(args.target_invite_id, inviteId);
        return { single: async () => ({ data: allowed ? delivery : null, error: allowed ? null : {} }) };
      }
      assert.equal(name, "admit_image_operation"); assert.equal(args.requested_operation, "invite_email");
      return Promise.resolve({ error: denied ? { message: "IMAGE_RATE_LIMITED" } : null });
    } } } : null },
    fetch: async (_url, options) => {
      sends.push(options);
      if (fail) throw new Error("private provider detail");
      return Response.json({ id: "message" });
    },
  });
  return { sends, calls, invoke: () => handler(new Request("https://fixture.invalid", { method: "POST", body: JSON.stringify({ inviteId, recipientEmail: "forged@example.invalid" }) })) };
};

test("invitation mail requires authorization and request admission before provider delivery", async () => {
  for (const [options, expected] of [[{ signedIn: false }, 401], [{ allowed: false }, 403], [{ denied: true }, 429]]) {
    const fixture = setup(options);
    assert.equal((await fixture.invoke()).status, expected);
    assert.equal(fixture.sends.length, 0);
  }
});

test("authorized invitation retries use the database recipient, provider idempotency and bounded I/O", async () => {
  const fixture = setup();
  assert.equal((await fixture.invoke()).status, 200);
  assert.equal((await fixture.invoke()).status, 200);
  assert.equal(JSON.parse(fixture.sends[0].body).to, "recipient@example.invalid");
  assert.equal(fixture.sends[0].headers["Idempotency-Key"], fixture.sends[1].headers["Idempotency-Key"]);
  assert.ok(fixture.sends[0].signal instanceof AbortSignal);
  assert.deepEqual(fixture.calls, ["get_household_invite_delivery", "admit_image_operation", "get_household_invite_delivery", "admit_image_operation"]);
  const failed = setup({ fail: true });
  const response = await failed.invoke();
  assert.doesNotMatch(await response.text(), /private provider detail/);
  assert.equal(failed.sends.length, 1, "no blind provider retry");
});
