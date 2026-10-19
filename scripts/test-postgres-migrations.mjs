import assert from "node:assert/strict";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import pg from "pg";
import { verifyDatabaseRelease } from "./lib/verifyDatabaseRelease.mjs";

// Real PostgreSQL, application SQL and RLS. Auth/Storage are platform fixtures;
// Vault is deliberately plaintext here and MUST NOT be mistaken for Supabase.
const connection = process.env.PLANTIE_TEST_POSTGRES_URL;
if (!connection) throw new Error("PLANTIE_TEST_POSTGRES_URL is required (disposable loopback administrator only).");
const url = new URL(connection);
if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.search)
  throw new Error("Only a loopback PostgreSQL URL without query overrides is allowed.");
const admin = new pg.Client({ connectionString: connection });
await admin.connect();
const names = [];
const createdRoles = [];
const clients = [];
let releaseChecks;
const migrations = (await readdir("supabase/migrations")).filter(name => /^\d{14}_.+\.sql$/.test(name)).sort();
const fixtures = (await readdir("supabase/tests")).filter(name => name.endsWith(".sql")).sort();
const owner = "11111111-1111-4111-8111-111111111111";
const household = "22222222-2222-4222-8222-222222222222";
const plant = "33333333-3333-4333-8333-333333333333";
const platform = `create schema auth; create schema storage; create schema extensions; create schema vault;
 create extension pgcrypto with schema extensions;
 create table auth.users(id uuid primary key, aud text, role text, email text, email_confirmed_at timestamptz, created_at timestamptz, updated_at timestamptz, raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),current_setting('request.jwt.claims',true)::jsonb->>'role') $$;
 create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, metadata jsonb, unique(bucket_id,name));
 alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
 create table vault.fixture_secrets(id uuid primary key default gen_random_uuid(), decrypted_secret text);
 create view vault.decrypted_secrets as select * from vault.fixture_secrets;
 create function vault.create_secret(text) returns uuid language sql as $$ insert into vault.fixture_secrets(decrypted_secret) values ($1) returning id $$;
 grant usage on schema public,auth,storage,extensions to anon,authenticated,service_role;
 grant all on storage.objects to authenticated,service_role;
 grant all on storage.buckets to service_role;`;
const apply = async (client, files) => {
  for (const name of files) {
    let sql = await readFile(`supabase/migrations/${name}`, "utf8");
    // Exactly one unsupported platform extension declaration, never business SQL.
    if (name === "20261006113000_recoverable_household_invites.sql") {
      assert.equal((sql.match(/create extension if not exists supabase_vault with schema vault;/g) ?? []).length, 1);
      sql = sql.replace("create extension if not exists supabase_vault with schema vault;", "-- Supabase Vault replaced by explicit test-only adapter.");
    }
    try { await client.query(sql); } catch (error) { throw new Error(`Migration ${name}: ${error.message}`, { cause: error }); }
  }
};
const schema = async client => (await client.query(`select jsonb_build_object(
 'tables',(select jsonb_agg(row_to_json(t) order by t.table_name,t.ordinal_position) from (select table_name,column_name,ordinal_position,data_type,is_nullable,column_default from information_schema.columns where table_schema='public') t),
 'constraints',(select jsonb_agg(row_to_json(t) order by t.table_name,t.name) from (select c.relname table_name,k.conname name,pg_get_constraintdef(k.oid) definition from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public') t),
 'functions',(select jsonb_agg(row_to_json(t) order by t.name,t.args) from (select p.proname name,pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) definition,p.prosecdef security_definer,p.proacl::text grants,pg_get_userbyid(p.proowner) owner from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') t),
 'policies',(select jsonb_agg(row_to_json(t) order by t.schemaname,t.tablename,t.policyname) from (select * from pg_policies where schemaname in ('public','storage')) t),
 'indexes',(select jsonb_agg(row_to_json(t) order by t.tablename,t.indexname) from (select tablename,indexname,indexdef from pg_indexes where schemaname='public') t),
 'table_grants',(select jsonb_agg(row_to_json(t) order by t.table_name,t.grantee,t.privilege_type) from (select table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema='public') t)
 ) as snapshot`)).rows[0].snapshot;
try {
  await admin.query("select pg_advisory_lock(hashtext('plantie-disposable-fixture-roles'))");
  for (const role of ["anon", "authenticated", "service_role"]) {
    if (!(await admin.query("select exists(select 1 from pg_roles where rolname=$1) present", [role])).rows[0].present) {
      await admin.query(`create role ${role}`); createdRoles.push(role);
    }
  }
  for (const kind of ["clean", "upgrade"]) {
    const name = `plantie_v4_${randomUUID().replaceAll("-", "")}`;
    await admin.query(`create database ${name} encoding 'UTF8' template template0 lc_collate 'C' lc_ctype 'C'`); names.push(name);
    url.pathname = `/${name}`;
    const client = new pg.Client({ connectionString: url.toString() });
    await client.connect(); clients.push(client);
    await client.query(platform);
    const baseline = migrations.filter(name => name < "20261018190000");
    await apply(client, kind === "clean" ? migrations : baseline);
    if (kind === "upgrade") {
      await client.query(`insert into auth.users(id,email) values ('${owner}','synthetic@example.invalid');
        insert into public.households(id,name,created_by) values ('${household}','Synthetic upgrade', '${owner}');
        insert into public.household_members(household_id,user_id,role,status) values ('${household}','${owner}','owner','active');
        select set_config('request.jwt.claim.sub','${owner}',false);
        insert into public.plants(id,household_id,source,display_name,likely_name,identification,identification_note,short_care,light,watering,soil,created_by,image_path)
          values ('${plant}','${household}','custom','Upgrade fixture','Fixture','confident','','','','','','${owner}','${household}/plants/${plant}/original.jpg');`);
      const before = (await client.query("select row_to_json(p) value from public.plants p where id=$1", [plant])).rows[0].value;
      await apply(client, migrations.filter(name => !baseline.includes(name)));
      assert.deepEqual((await client.query("select row_to_json(p) value from public.plants p where id=$1", [plant])).rows[0].value, before);
    }
    for (const fixture of fixtures) {
      await client.query("begin");
      try { await client.query(await readFile(`supabase/tests/${fixture}`, "utf8")); }
      catch (error) { throw new Error(`SQL fixture ${fixture}: ${error.message}`, { cause: error }); }
      finally { await client.query("rollback"); }
    }
    // A missing historical household is valid on a clean install; a partial
    // historical match must still fail closed instead of granting ownership.
    const historical = await readFile("supabase/migrations/20261005200000_household_content_permissions_and_special_owner.sql", "utf8");
    const grantBlock = historical.slice(historical.indexOf("do $$\ndeclare\n  special_household_id"), historical.indexOf("-- Two Owners"));
    assert.ok(grantBlock.startsWith("do $$"));
    await client.query("begin");
    try {
      const fixtureUser = randomUUID();
      await client.query("insert into auth.users(id,email) values ($1,'historical-fixture@example.invalid')", [fixtureUser]);
      await client.query("insert into public.households(name,created_by) values ('Petzvalova',$1)", [fixtureUser]);
      await assert.rejects(client.query(grantBlock), /Designated Petzvalova household or owners were not found/);
    } finally { await client.query("rollback"); }
  }
  const snapshots = await Promise.all(clients.map(schema));
  assert.deepEqual(snapshots[0], snapshots[1], "clean/upgrade schemas, grants, owners and RLS match");
  releaseChecks = await verifyDatabaseRelease(clients[1], url.toString());
  const report = { platform: "PostgreSQL with Auth/Storage fixtures and plaintext Vault adapter", migrations: migrations.length,
    cleanReplay: "PASS_WITH_PLATFORM_ADAPTERS", syntheticUpgrade: "PASS_WITH_PLATFORM_ADAPTERS", fixturesPerReplay: fixtures.length,
    preservedPlantAndImageReference: true, releaseChecks, schemaDiff: [], schemaSha256: createHash("sha256").update(JSON.stringify(snapshots[0])).digest("hex"),
    fullSupabase: "BLOCKED: Docker unavailable locally; Vault encryption, PostgREST and Storage service not exercised" };
  await mkdir(".tmp-tests", { recursive: true });
  await writeFile(".tmp-tests/v4-schema-diff.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await Promise.allSettled(clients.map(client => client.end()));
  try {
    for (const name of names) await admin.query(`drop database ${name}`);
    for (const role of createdRoles) await admin.query(`drop role ${role}`);
  } finally { await admin.end(); }
}
