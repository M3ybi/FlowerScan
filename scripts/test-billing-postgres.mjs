import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createAiTestDatabase } from "./lib/aiTestDatabase.mjs";

// Reuse the existing disposable loopback database/platform fixtures. Never a hosted backend.
const db = await createAiTestDatabase();
try {
  const { owner } = db;
  const actor = randomUUID(), household = randomUUID();
  await owner.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [actor, `billing-${actor}@fixture.invalid`]);
  await owner.query("insert into public.households(id,name,created_by) values($1,'Billing concurrency fixture',$2)", [household, actor]);
  await owner.query("insert into public.household_members(household_id,user_id,role,status) values($1,$2,'owner','active')", [household, actor]);
  await owner.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  const review = (await owner.query("select * from public.request_account_deletion() ")).rows[0];
  await owner.query("update public.account_deletion_requests set status='processing' where id=$1", [review.request_id]);
  const writer = await db.connect(), deleter = await db.connect();
  const deletePid = (await deleter.query("select pg_backend_pid() pid")).rows[0].pid;
  await writer.query("begin");
  await writer.query("select id from public.households where id=$1 for update", [household]);
  await writer.query("insert into public.user_subscriptions(user_id,plan_key,platform,status,billing_period,current_period_start,current_period_end,expires_at) values($1,'premium_monthly','web','active','monthly',now(),now()+interval '1 month',now()+interval '1 month')", [actor]);
  const removal = deleter.query("delete from auth.users where id=$1", [actor]).then(() => ({ allowed: true }), error => ({ error }));
  let blocked = false;
  for (let attempt = 0; attempt < 200; attempt++) {
    blocked = (await owner.query("select cardinality(pg_blocking_pids($1))>0 blocked", [deletePid])).rows[0].blocked;
    if (blocked) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(blocked, true, "Actual independent-session lock barrier must be observed before committing billing");
  await writer.query("commit");
  const result = await removal;
  assert.match(result.error?.message ?? "", /ACCOUNT_DELETION_BILLING_REVIEW_REQUIRED/);
  assert.equal((await owner.query("select count(*)::int n from auth.users where id=$1", [actor])).rows[0].n, 1);
  assert.equal((await owner.query("select count(*)::int n from public.user_subscriptions where user_id=$1 and status='active'", [actor])).rows[0].n, 1);
  console.log(JSON.stringify({ platform: "disposable PostgreSQL with Auth/Storage/Vault fixtures", sessions: 3, concurrentBillingCommitBeforeDeletion: "PASS", accountAndSubscriptionRetained: "PASS", providerCalls: 0 }));
} finally { await db.close(); }
