import assert from "node:assert/strict";
import test from "node:test";
import { containsClientSecret } from "../scripts/check-client-secrets.mjs";

const token = role => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.synthetic_signature`;
test("client artifact scanner permits public keys but rejects privileged credentials without exposing values", () => {
  assert.equal(containsClientSecret(token("anon")), false);
  assert.equal(containsClientSecret(`export const key = '${token("service_role")}';`), true);
  assert.equal(containsClientSecret("-----BEGIN PRIVATE KEY-----\nsynthetic"), true);
  assert.equal(containsClientSecret("sk-proj-" + "synthetic".repeat(8)), true);
  for (const prefix of ["sb_secret_", "re_", "sk_"]) assert.equal(containsClientSecret(prefix + "synthetic".repeat(5)), true);
  assert.equal(containsClientSecret("sb_publishable_" + "synthetic".repeat(5)), false);
  assert.equal(containsClientSecret("goog_public_sdk_key appl_public_sdk_key rcb_public_key"), false);
});
