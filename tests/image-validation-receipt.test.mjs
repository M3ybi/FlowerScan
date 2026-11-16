import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: 'export * from "./supabase/functions/_shared/imageValidationReceipt.ts";export * from "./supabase/functions/_shared/aiModelRegistry.ts";' }, bundle: true, write: false, format: "esm" });
const { issueImageValidationReceipt: issue, verifyImageValidationReceipt: verify, getLunaConfiguration, getModelConfiguration } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const secret = "synthetic-test-signing-key-32-characters";
const bytes = new Uint8Array([1, 2, 3]);
const now = 1_000_000;
test("safety receipts bind the exact bytes, user, expiry and signing key", async () => {
  const receipt = await issue(bytes, "user-one", secret, now);
  assert.equal(await verify(receipt.token, bytes, "user-one", secret, now), true);
  for (const [token, content, user, key, time] of [
    [receipt.token, new Uint8Array([1, 2, 4]), "user-one", secret, now],
    [receipt.token, bytes, "user-two", secret, now],
    [receipt.token, bytes, "user-one", secret + "changed", now],
    [receipt.token, bytes, "user-one", secret, receipt.expiresAt],
    [receipt.token, bytes, "user-one", secret, now - 1000],
    [receipt.token + ".extra", bytes, "user-one", secret, now],
    ["invalid", bytes, "user-one", secret, now],
  ]) assert.equal(await verify(token, content, user, key, time), false);
  const [claims, signature] = receipt.token.split(".");
  const altered = JSON.parse(atob(claims)); altered.action = "delete";
  assert.equal(await verify(`${btoa(JSON.stringify(altered))}.${signature}`, bytes, "user-one", secret, now), false);
  assert.equal(await verify(receipt.token, bytes, "user-one", undefined, now), false);
  assert.equal(await issue(bytes, "user-one", "short", now), undefined);
});

test("signed evidence binds the trusted configuration; environment defaults cannot change it", async () => {
  const previous = globalThis.Deno;
  let model = "gpt-4o";
  globalThis.Deno = { env: { get: key => key === "OPENAI_MODEL" ? model : undefined } };
  try {
    const receipt = await issue(bytes,"user-one",secret,now);
    const claims = JSON.parse(atob(receipt.token.split(".")[0]));
    assert.equal(claims.version,3); assert.match(claims.policy,/^[0-9a-f]{64}$/);
    assert.equal(await verify(receipt.token,bytes,"user-one",secret,now),true);
    model = "synthetic-incompatible-policy-model";
    assert.equal(await verify(receipt.token,bytes,"user-one",secret,now),true);
    assert.equal(await verify(receipt.token,bytes,"user-one",secret,now,getLunaConfiguration('image_safety','low')),false);
    const legacy = await issue(bytes,'user-one',secret,now,getModelConfiguration('image_safety:gpt-4o:legacy:v1'));
    assert.equal(await verify(legacy.token,bytes,'user-one',secret,now),false);
  } finally { if(previous === undefined)delete globalThis.Deno;else globalThis.Deno=previous; }
});
