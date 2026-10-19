import { webcrypto } from "node:crypto";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync("supabase/migrations/20261018200000_account_deletion_review.sql", "utf8");
const user = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";

test("deletion review queue is idempotent, self-scoped, private, audited and non-destructive", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; grant usage on schema auth to authenticated;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      insert into auth.users values ('${user}'), ('${other}');`);
    await db.exec(migration);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
    await db.exec("set role authenticated");
    const first = (await db.query("select * from public.request_account_deletion() ")).rows[0];
    const again = (await db.query("select * from public.request_account_deletion() ")).rows[0];
    assert.equal(first.request_id, again.request_id);
    assert.equal(first.request_status, "requested");
    await assert.rejects(db.query("update public.account_deletion_requests set status = 'completed'"), /permission denied/);
    await assert.rejects(db.query("select * from public.account_deletion_request_audit"), /permission denied/);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [other]);
    assert.equal((await db.query("select * from public.account_deletion_requests")).rows.length, 0);
    await db.exec("reset role");
    assert.equal((await db.query("select * from public.account_deletion_request_audit")).rows.length, 1);
    await db.query("update public.account_deletion_requests set status = 'processing' where id = $1", [first.request_id]);
    assert.equal((await db.query("select * from public.account_deletion_request_audit")).rows.length, 2);
    assert.equal((await db.query("select * from auth.users")).rows.length, 2);
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
    await assert.rejects(db.query("select * from public.request_account_deletion()"), /AUTHENTICATION_REQUIRED/);
    await db.exec("set role anon");
    await assert.rejects(db.query("select * from public.request_account_deletion()"), /permission denied/);
  } finally { await db.close(); }
});

const bundle = await build({ entryPoints: ["supabase/functions/delete-account-request/index.ts"], bundle: true, write: false, format: "iife", plugins: [{
  name: "auth-boundary", setup(builder) {
    builder.onResolve({ filter: /\/auth\.ts$/ }, () => ({ path: "auth", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const requireUser = async () => globalThis.auth;" }));
  },
}] });

test("deletion endpoint ignores forged account targets and never acknowledges failed persistence", async () => {
  for (const [signedIn, failure, expected] of [[false, false, 401], [true, true, 503], [true, false, 202]]) {
    let handler;
    let calls = 0;
    vm.runInNewContext(bundle.outputFiles[0].text, { crypto: webcrypto, console: { info() {} },
      Deno: { serve: value => { handler = value; } }, Response, Headers,
      auth: signedIn ? { user: { id: user }, client: { rpc: async (...args) => {
        calls++; assert.deepEqual(Array.from(args), ["request_account_deletion"]);
        return { error: failure ? { message: "private database detail" } : null,
          data: failure ? null : [{ request_id: "request", request_status: "requested" }] };
      } } } : null,
    });
    const response = await handler(new Request("https://fixture.invalid", { method: "POST", body: JSON.stringify({ userId: other, contact: "victim@example.invalid" }) }));
    assert.equal(response.status, expected);
    const payload = await response.text();
    assert.doesNotMatch(payload, /private database detail|victim|22222222/);
    assert.equal(calls, signedIn ? 1 : 0);
    if (expected === 202) assert.equal(JSON.parse(payload).destructiveAction, false);
  }
});
