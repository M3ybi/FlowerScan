import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const user = "11111111-1111-4111-8111-111111111111";
const household = "22222222-2222-4222-8222-222222222222";
const otherHousehold = "33333333-3333-4333-8333-333333333333";
const id = value => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const setup = async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.households(id uuid primary key);
    create table public.plants(household_id uuid, image_path text);
    create table public.plant_diagnostics(household_id uuid, image_path text);
    create table storage.objects(bucket_id text, name text);
    create table public.members(household_id uuid, user_id uuid);
    create function public.can_manage_household_content(target_household_id uuid) returns boolean language sql as $$
      select exists(select 1 from public.members where household_id = target_household_id and user_id = auth.uid()) $$;
    insert into auth.users values ('${user}');
    insert into public.households values ('${household}'), ('${otherHousehold}');
    insert into public.members values ('${household}', '${user}');
    select set_config('request.jwt.claim.sub', '${user}', false);
  `);
  await db.exec(readFileSync("supabase/migrations/20261018190000_image_operation_admission.sql", "utf8"));
  return db;
};

test("database admission caps parallel queued requests, resets its window and denies direct counter edits", async () => {
  const db = await setup();
  try {
    const attempts = await Promise.allSettled(Array.from({ length: 70 }, () => db.query("select public.admit_image_operation($1)", ["validation"])));
    assert.equal(attempts.filter(value => value.status === "fulfilled").length, 60);
    assert.equal(attempts.filter(value => value.status === "rejected" && /IMAGE_RATE_LIMITED/.test(value.reason.message)).length, 10);
    await db.exec("update public.image_operation_limits set window_started = now() - interval '2 hours'");
    await db.query("select public.admit_image_operation('validation')");
    assert.equal((await db.query("select requests from public.image_operation_limits")).rows[0].requests, 1);
    await assert.rejects(db.query("select public.admit_image_operation('made-up')"), /INVALID_OPERATION/);
    await db.exec("set role authenticated");
    await assert.rejects(db.query("update public.image_operation_limits set requests = 1"), /permission denied/);
    await assert.rejects(db.query("select * from public.image_upload_intents"), /permission denied/);
    await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false)");
    await assert.rejects(db.query("select public.admit_image_operation('care')"), /AUTHENTICATION_REQUIRED/);
  } finally { await db.close(); }
});

test("upload intents bound unclaimed storage, permit retry/claim and preserve all stored images", async () => {
  const db = await setup();
  const reserve = (value, home = household, kind = "plant") => db.query("select public.reserve_image_upload($1, $2, $3)", [home, kind, id(value)]);
  try {
    await assert.rejects(reserve(1, otherHousehold), /HOUSEHOLD_ACCESS_DENIED/);
    await assert.rejects(reserve(1, household, "../invalid"), /INVALID_IMAGE/);
    for (let value = 1; value <= 20; value++) await reserve(value);
    await reserve(1);
    assert.equal((await db.query("select count(*)::int as count from public.image_upload_intents")).rows[0].count, 20);
    await assert.rejects(reserve(21), /IMAGE_UPLOAD_CAPACITY/);
    const path = `${household}/plants/${id(1)}/original.jpg`;
    await db.query("insert into public.plants values ($1, $2)", [household, path]);
    await reserve(21);
    await reserve(1); // Legacy replacement of a referenced object remains supported.
    await db.query("insert into storage.objects values ('plant-images', $1)", [`${household}/plants/${id(2)}/original.jpg`]);
    await db.exec("update public.image_upload_intents set created_at = now() - interval '2 hours'");
    await reserve(22);
    assert.equal((await db.query("select count(*)::int as count from storage.objects")).rows[0].count, 1, "admission never deletes stored images");
    assert.equal((await db.query("select count(*)::int as count from public.image_upload_intents")).rows[0].count, 2, "expire only intents without objects");
    for (let value = 30; value < 48; value++) await db.query("insert into storage.objects values ('diagnostic-images', $1)", [`${household}/diagnostics/${id(value)}/image.jpg`]);
    await assert.rejects(reserve(99), /IMAGE_UPLOAD_CAPACITY/, "preexisting orphan objects also consume capacity");
  } finally { await db.close(); }
});
