import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";

// This runner creates and drops only its own random database. Never point it at
// a linked Supabase project or reuse an existing business database.
const connection = process.env.PLANTIE_TEST_POSTGRES_URL;
if (!connection) throw new Error("Set PLANTIE_TEST_POSTGRES_URL to a disposable loopback PostgreSQL administrator connection.");
const url = new URL(connection);
if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Use a PostgreSQL connection URL.");
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Concurrency tests require a loopback PostgreSQL server.");
if (url.search) throw new Error("Connection query overrides are not allowed in disposable database tests.");
const admin = new pg.Client({ connectionString: connection });
await admin.connect();
const database = `plantie_test_${randomUUID().replaceAll("-", "")}`;
const clients = [];
const createdRoles = [];
let databaseCreated = false;
const user = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const home = "33333333-3333-4333-8333-333333333333";
const id = value => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
let checks = 0;
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); checks++; };
try {
  await admin.query("select pg_advisory_lock(hashtext('plantie-disposable-fixture-roles'))");
  await admin.query(`create database ${database}`);
  databaseCreated = true;
  for (const role of ["anon", "authenticated", "service_role"]) {
    const exists = (await admin.query("select exists(select 1 from pg_roles where rolname=$1) as present", [role])).rows[0].present;
    if (!exists) { await admin.query(`create role ${role}`); createdRoles.push(role); }
  }
  url.pathname = `/${database}`;
  for (let i = 0; i < 16; i++) {
    const client = new pg.Client({ connectionString: url.toString() });
    await client.connect(); clients.push(client);
  }
  const owner = clients[0];
  await owner.query(`create schema auth; create schema storage; grant usage on schema auth to authenticated;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.households(id uuid primary key);
    create table public.members(household_id uuid, user_id uuid);
    create table public.plants(household_id uuid, image_path text);
    create table public.plant_diagnostics(household_id uuid, image_path text);
    create table storage.objects(bucket_id text, name text);
    create function public.can_manage_household_content(target_household_id uuid) returns boolean language sql security definer as $$
      select exists(select 1 from public.members where household_id = target_household_id and user_id = auth.uid()) $$;
    insert into auth.users values ('${user}'), ('${other}'); insert into public.households values ('${home}');
    insert into public.members values ('${home}', '${user}'), ('${home}', '${other}');`);
  for (const name of ["20261018190000_image_operation_admission.sql", "20261018200000_account_deletion_review.sql", "20261018201000_complete_request_admission.sql"]) {
    await owner.query(await readFile(`supabase/migrations/${name}`, "utf8"));
  }
  const pids = new Set();
  for (const [i, client] of clients.entries()) {
    pids.add((await client.query("select pg_backend_pid() as pid")).rows[0].pid);
    await client.query("select set_config('request.jwt.claim.sub', $1, false)", [i % 2 ? other : user]);
  }
  equal(pids.size, 16, "independent database sessions");
  const parallel = async (count, work) => (await Promise.all(clients.map(async (client, index) => {
    const outcomes = [];
    for (let value = index; value < count; value += clients.length) {
      try { outcomes.push({ ok: true, value: await work(client, value) }); }
      catch (error) { outcomes.push({ ok: false, message: error.message }); }
    }
    return outcomes;
  }))).flat();
  // Same user across 16 sessions: no process-local serialization can protect it.
  for (const client of clients) await client.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  for (const [operation, count, cap] of [["validation", 80, 60], ["diagnosis", 45, 30], ["invite_email", 20, 6]]) {
    const results = await parallel(count, client => client.query("select public.admit_image_operation($1)", [operation]));
    equal(results.filter(value => value.ok).length, cap, `${operation} exact cap under contention`);
    equal(results.filter(value => !value.ok && /IMAGE_RATE_LIMITED/.test(value.message)).length, count - cap);
  }
  for (const [i, client] of clients.entries()) await client.query("select set_config('request.jwt.claim.sub', $1, false)", [i % 2 ? other : user]);
  const reservations = await parallel(40, (client, value) => client.query("select public.reserve_image_upload($1,'plant',$2)", [home, id(value)]));
  equal(reservations.filter(value => value.ok).length, 20, "household cap shared by two users");
  equal(reservations.filter(value => !value.ok && /IMAGE_UPLOAD_CAPACITY/.test(value.message)).length, 20);
  const chosen = (await owner.query("select path from public.image_upload_intents limit 1")).rows[0].path;
  const chosenId = chosen.split("/")[2];
  const retries = await parallel(40, client => client.query("select public.reserve_image_upload($1,'plant',$2)", [home, chosenId]));
  equal(retries.filter(value => value.ok).length, 40, "identical IDs are idempotent at full capacity");
  equal((await owner.query("select count(*)::int as count from public.image_upload_intents")).rows[0].count, 20);
  await owner.query("insert into public.plants values ($1,$2)", [home, chosen]);
  await owner.query("select public.reserve_image_upload($1,'plant',$2)", [home, id(999)]);
  equal((await owner.query("select count(*)::int as count from public.image_upload_intents")).rows[0].count, 20, "claimed object frees capacity");
  // An explicit transaction rollback releases both the intent and row lock.
  await owner.query("delete from public.image_upload_intents");
  await owner.query("begin");
  await owner.query("select public.reserve_image_upload($1,'plant',$2)", [home, id(1000)]);
  const waiter = clients[1].query("select public.reserve_image_upload($1,'plant',$2)", [home, id(1001)]);
  const deadline = Date.now() + 5000;
  let waiting = false;
  while (!waiting && Date.now() < deadline) {
    waiting = (await admin.query("select exists(select 1 from pg_stat_activity where datname=$1 and wait_event_type='Lock') as waiting", [database])).rows[0].waiting;
    if (!waiting) await new Promise(resolve => setImmediate(resolve));
  }
  equal(waiting, true, "second session waits for household lock");
  await owner.query("rollback"); await waiter;
  equal((await owner.query("select count(*)::int as count from public.image_upload_intents")).rows[0].count, 1, "rollback leaves only committed intent");
  const deletion = await parallel(64, client => client.query("select * from public.request_account_deletion()"));
  equal(deletion.filter(value => value.ok).length, 64);
  equal((await owner.query("select count(*)::int as count from public.account_deletion_requests")).rows[0].count, 2, "one request per authenticated user under concurrency");
  equal((await owner.query("select count(*)::int as count from public.account_deletion_request_audit")).rows[0].count, 2, "retries do not duplicate audit events");

  // Exercise the deployed monthly-quota SQL on actual independent sessions.
  // Only its surrounding Auth/membership/Premium boundaries are fixtures.
  const originalQuota = await readFile("supabase/migrations/20260615120000_household_premium_usage_limits.sql", "utf8");
  for (const table of ["household_usage_counters", "household_usage_reservations"]) {
    const ddl = originalQuota.match(new RegExp(`create table if not exists public\\.${table} \\([\\s\\S]*?\\n\\);`))?.[0];
    assert.ok(ddl, `Missing actual ${table} definition`); await owner.query(ddl);
  }
  await owner.query(`create table public.subscription_plans(plan_key text primary key, ai_scans_monthly_limit integer);
    insert into public.subscription_plans values ('free',5);
    create function auth.role() returns text language sql stable as $$ select coalesce(current_setting('request.jwt.claim.role',true),'authenticated') $$;
    create function public.is_household_premium(uuid) returns boolean language sql as $$ select false $$;
    create function public.assert_household_member(target_household_id uuid) returns void language plpgsql as $$ begin
      if not public.can_manage_household_content(target_household_id) then raise exception 'Denied'; end if; end $$;`);
  const quotaIntegrity = await readFile("supabase/migrations/20261016120000_plant_creation_and_quota_integrity.sql", "utf8");
  for (const name of ["household_usage_period_start", "household_usage_period_end", "free_household_ai_analyzes_monthly_limit",
    "expire_ai_analyze_reservations", "assert_can_run_ai_analyze", "reserve_ai_analyze_usage", "commit_ai_analyze_usage", "release_ai_analyze_reservation"]) {
    const sql = quotaIntegrity.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`))?.[0];
    assert.ok(sql, `Missing actual ${name} definition`); await owner.query(sql);
  }
  const usageType = "plant_unwell_ai_analyze";
  const monthly = await parallel(40, client => client.query("select public.reserve_ai_analyze_usage($1,$2) as id", [home, usageType]));
  equal(monthly.filter(value => value.ok).length, 5, "five free reservations under real contention");
  equal(monthly.filter(value => !value.ok && /Free households/.test(value.message)).length, 35);
  const reserved = (await owner.query("select id from public.household_usage_reservations order by id")).rows;
  for (const client of clients) await client.query("select set_config('request.jwt.claim.role','service_role',false)");
  const commits = await parallel(32, client => client.query("select public.commit_ai_analyze_usage($1,$2,$3)", [home,reserved[0].id,usageType]));
  equal(commits.filter(value => value.ok).length, 1, "duplicate commit consumes once");
  equal((await owner.query("select used_count from public.household_usage_counters")).rows[0].used_count, 1);
  const releases = await parallel(32, client => client.query("select public.release_ai_analyze_reservation($1,$2,$3)", [home,reserved[1].id,usageType]));
  equal(releases.filter(value => value.ok).length, 32, "duplicate release is safe");
  equal((await owner.query("select reserved_count from public.household_usage_counters")).rows[0].reserved_count, 3);
  await owner.query("select set_config('request.jwt.claim.role','authenticated',false)");
  await assert.rejects(owner.query("select public.commit_ai_analyze_usage($1,$2,$3)", [home,reserved[2].id,usageType]), /Trusted AI service required/); checks++;
  await owner.query("update public.household_usage_reservations set created_at=now()-interval '3 minutes' where status='reserved'");
  const recovered = await parallel(40, client => client.query("select public.reserve_ai_analyze_usage($1,$2)", [home,usageType]));
  equal(recovered.filter(value => value.ok).length, 4, "expired leases recover exactly remaining free capacity");
  const usage = (await owner.query("select used_count,reserved_count from public.household_usage_counters")).rows[0];
  equal(usage.used_count + usage.reserved_count, 5, "counter remains consistent after expiry and contention");
  await owner.query("set timezone='Pacific/Honolulu'");
  equal((await owner.query("select public.household_usage_period_start('2026-10-01T04:59:59Z') as start")).rows[0].start.toISOString(), "2026-09-01T05:00:00.000Z");
  equal((await owner.query("select public.household_usage_period_start('2026-10-01T05:00:00Z') as start")).rows[0].start.toISOString(), "2026-10-01T05:00:00.000Z");
  await owner.query("update public.image_operation_limits set window_started=now()-interval '2 hours' where operation='invite_email'");
  for (const client of clients) await client.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  const nextWindow = await parallel(20, client => client.query("select public.admit_image_operation('invite_email')"));
  equal(nextWindow.filter(value => value.ok).length, 6, "hourly reset preserves atomic cap");
  await owner.query("set role authenticated");
  await assert.rejects(owner.query("update public.image_operation_limits set requests=1"), /permission denied/); checks++;
  await assert.rejects(owner.query("update public.account_deletion_requests set status='completed'"), /permission denied/); checks++;
  equal((await owner.query("select count(*)::int as count from public.account_deletion_requests")).rows[0].count, 1, "RLS returns only self");
  console.log(`PostgreSQL ${ (await owner.query('show server_version')).rows[0].server_version }: ${checks} assertions passed across ${pids.size} independent sessions.`);
} finally {
  await Promise.allSettled(clients.map(client => client.end()));
  try {
    if (databaseCreated) await admin.query(`drop database ${database}`);
    for (const role of createdRoles) await admin.query(`drop role ${role}`);
  } finally { await admin.end(); }
}
