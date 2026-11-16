import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const original = readFileSync("supabase/migrations/20261018200000_account_deletion_review.sql", "utf8");
const guard = readFileSync("supabase/migrations/20261116191922_billing_cancellation_deletion_safeguards.sql", "utf8");
const user = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const home = "33333333-3333-4333-8333-333333333333";
const fixture = async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    grant usage on schema auth to authenticated;
    create table public.households(id uuid primary key);
    create table public.household_members(household_id uuid,user_id uuid references auth.users on delete cascade,role text,status text);
    create table public.user_subscriptions(id uuid default gen_random_uuid(),user_id uuid references auth.users on delete cascade,platform text,status text,expires_at timestamptz,current_period_end timestamptz,cancelled_at timestamptz);
    create table public.household_subscriptions(household_id uuid,provider text,status text,current_period_end timestamptz,cancelled_at timestamptz);
    insert into auth.users values('${user}'),('${other}');
    insert into public.households values('${home}');`);
  await db.exec(original); await db.exec(guard);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
  return db;
};

test("deletion keeps the same idempotent manual request and requires review before actual removal", async () => {
  const db = await fixture();
  try {
    const first = (await db.query("select * from public.request_account_deletion() ")).rows[0];
    assert.equal((await db.query("select * from public.request_account_deletion() ")).rows[0].request_id, first.request_id);
    assert.equal((await db.query("select billing_review from public.account_deletion_requests")).rows[0].billing_review.provider_inventory_verification_required, true);
    await assert.rejects(db.query("delete from auth.users where id=$1",[user]),/ACCOUNT_DELETION_BILLING_REVIEW_REQUIRED/);
    await db.query("update public.account_deletion_requests set status='processing' where id=$1",[first.request_id]);
    await db.query("delete from auth.users where id=$1",[user]);
    assert.equal((await db.query("select user_id,status from public.account_deletion_requests")).rows[0].user_id,null);
    assert.equal((await db.query("select count(*)::int n from public.account_deletion_request_audit")).rows[0].n,2);
  } finally { await db.close(); }
});

test("active, trial, grace, missing-date and cancelled-but-paid legacy subscriptions block completion and deletion", async () => {
  for (const [status,end,cancelled] of [
    ["active","now()+interval '1 day'","null"], ["active","now()-interval '1 day'","null"],
    ["trialing","now()+interval '1 day'","null"], ["grace_period","null","null"],
    ["cancelled","now()+interval '1 day'","now()"], ["cancelled","null","now()"],
    ["cancelled","now()-interval '1 day'","null"],
  ]) {
    const db = await fixture();
    try {
      await db.exec(`insert into public.user_subscriptions(user_id,platform,status,current_period_end,cancelled_at) values('${user}','web','${status}',${end},${cancelled});`);
      const request = (await db.query("select * from public.request_account_deletion() ")).rows[0];
      const review = (await db.query("select billing_review from public.account_deletion_requests")).rows[0].billing_review;
      assert.equal(review.blocking_subscriptions.length,1,`${status}: ${end}`);
      await assert.rejects(db.query("update public.account_deletion_requests set status='completed' where id=$1",[request.request_id]),/ACCOUNT_DELETION_BILLING_REVIEW_REQUIRED/);
      await db.query("update public.account_deletion_requests set status='processing' where id=$1",[request.request_id]);
      await assert.rejects(db.query("delete from auth.users where id=$1",[user]),/ACCOUNT_DELETION_BILLING_REVIEW_REQUIRED/);
      assert.equal((await db.query("select status from public.user_subscriptions")).rows[0].status,status);
    } finally { await db.close(); }
  }
});

test("provider-confirmed terminal or elapsed cancelled periods permit existing manual processing", async () => {
  for (const status of ["expired","refunded","cancelled"]) {
    const db = await fixture();
    try {
      await db.exec(`insert into public.user_subscriptions(user_id,platform,status,current_period_end,cancelled_at) values('${user}','web','${status}',now()-interval '1 day',now()-interval '2 days');`);
      const request = (await db.query("select * from public.request_account_deletion() ")).rows[0];
      await db.query("update public.account_deletion_requests set status='completed' where id=$1",[request.request_id]);
      await db.query("delete from auth.users where id=$1",[user]);
    } finally { await db.close(); }
  }
});

test("last billing Owner is protected; Viewer and surviving coowner billing stay unchanged", async () => {
  for (const role of ["owner","viewer"]) {
    const db = await fixture();
    try {
      await db.exec(`insert into public.household_members values('${home}','${user}','${role}','active');
        insert into public.household_subscriptions values('${home}','web','active',now()+interval '1 month',null);`);
      await db.query("select * from public.request_account_deletion()");
      await db.exec("update public.account_deletion_requests set status='processing'");
      if(role==='owner') {
        await assert.rejects(db.query("delete from auth.users where id=$1",[user]),/ACCOUNT_DELETION_BILLING_REVIEW_REQUIRED/);
        await db.exec(`insert into public.household_members values('${home}','${other}','owner','active')`);
      }
      await db.query("delete from auth.users where id=$1",[user]);
      assert.equal((await db.query("select status from public.household_subscriptions")).rows[0].status,'active');
    } finally { await db.close(); }
  }
});

test("billing context cannot be requested for another account by ordinary clients", async () => {
  const db=await fixture();
  try {
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select public.account_deletion_billing_context($1)",[other]),/permission denied/);
    await assert.rejects(db.query("update public.account_deletion_requests set status='completed'"),/permission denied/);
  }finally{await db.close();}
});
