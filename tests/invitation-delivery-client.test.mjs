import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";

const target = ".tmp-tests/invitation-delivery-client.mjs";
await build({ entryPoints: ["src/lib/plantieRepository.ts"], outfile: target, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [{
  name: "supabase-boundary", setup(builder) {
    builder.onResolve({ filter: /\/supabase\.js$/ }, () => ({ path: "client", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const supabase={functions:{invoke:(...args)=>globalThis.__invitationBoundary(...args)}};" }));
  },
}] });
const { sendHouseholdInviteEmail } = await import(pathToFileURL(`${process.cwd()}/${target}`).href);
test("invitation HTTP throttling reaches the existing localized temporary-limit message", async () => {
  const original = globalThis.__invitationBoundary;
  globalThis.__invitationBoundary = async () => ({ data: null, error: { context: Response.json({ invitationCreated:true,emailSent:false,errorCode:"EMAIL_RATE_LIMITED" }, { status:429 }) } });
  try {
    const result = await sendHouseholdInviteEmail("fixture-invite");
    assert.equal(result.errorCode, "EMAIL_RATE_LIMITED"); assert.equal(result.emailSent, false);
  } finally { globalThis.__invitationBoundary = original; }
});

test("successful invitation responses retain safe fields and carry a cancellation signal", async () => {
  const original = globalThis.__invitationBoundary;
  globalThis.__invitationBoundary = async (_name, options) => {
    assert.ok(options.signal instanceof AbortSignal);
    return { data: { invitationCreated: true, emailSent: true, providerMessageId: "safe-provider-id", privatePayload: "discard-me" }, error: null };
  };
  try { assert.deepEqual(await sendHouseholdInviteEmail("fixture-invite"), { invitationCreated: true, emailSent: true, providerMessageId: "safe-provider-id" }); }
  finally { globalThis.__invitationBoundary = original; }
});

test("malformed throttling, unavailable transport and malformed success never blindly resend", async () => {
  const original = globalThis.__invitationBoundary;
  let calls = 0;
  try {
    globalThis.__invitationBoundary = async () => { calls++; return { data: null, error: { context: new Response("private-error", { status: 429 }) } }; };
    assert.equal((await sendHouseholdInviteEmail("fixture-invite")).errorCode, "EMAIL_RATE_LIMITED");
    globalThis.__invitationBoundary = async () => { calls++; return { data: null, error: new Error("secret-transport-detail") }; };
    await assert.rejects(sendHouseholdInviteEmail("fixture-invite"), /^Error: Invitation email delivery is unavailable/);
    globalThis.__invitationBoundary = async () => { calls++; return { data: { emailSent: true }, error: null }; };
    await assert.rejects(sendHouseholdInviteEmail("fixture-invite"), /invalid response/);
    assert.equal(calls, 3);
  } finally { globalThis.__invitationBoundary = original; }
});
