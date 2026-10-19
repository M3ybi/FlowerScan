import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

// Synthetic rows in the caller's disposable database only.
export const verifyDatabaseRelease = async (admin, connection) => {
  const [owner, viewer, suspended, removed, stranger, unrelated, home, otherHome, plant] = Array.from({ length: 9 }, () => randomUUID());
  const users = [owner, viewer, suspended, removed, stranger, unrelated];
  for (const id of users) await admin.query("insert into auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at) values ($1,'authenticated','authenticated',$2,now(),now(),now())", [id, `fixture-${id}@example.invalid`]);
  await admin.query("insert into public.households(id,name,created_by,premium_enabled,plan_key,premium_source) values ($1,'Concurrent release fixture',$2,true,'premium','manual_admin_grant'),($3,'Unrelated fixture',$4,false,'free',null)", [home, owner, otherHome, unrelated]);
  await admin.query("insert into public.household_members(household_id,user_id,role,status) values ($1,$2,'owner','active'),($1,$3,'viewer','active'),($1,$4,'viewer','suspended_plan_limit'),($5,$6,'owner','active')", [home, owner, viewer, suspended, otherHome, unrelated]);
  await admin.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await admin.query("insert into public.plants(id,household_id,source,display_name,likely_name,identification,identification_note,short_care,light,watering,soil,created_by) values ($1,$2,'custom','Fixture','Fixture','confident','','','','','',$3)", [plant, home, owner]);
  const sessions = [];
  let assertions = 0;
  const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions++; };
  try {
    for (let i = 0; i < 16; i++) { const client = new pg.Client({ connectionString: connection }); await client.connect(); sessions.push(client); }
    const pids = await Promise.all(sessions.map(async client => (await client.query("select pg_backend_pid() pid")).rows[0].pid));
    equal(new Set(pids).size, 16, "independent release-test sessions");
    for (const [label, id, allowed] of [["owner", owner, true], ["collaborating viewer", viewer, true], ["suspended", suspended, false],
      ["removed", removed, false], ["nonmember", stranger, false], ["other household", unrelated, false]]) {
      const client = sessions[0];
      await client.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
      await client.query("set role authenticated");
      equal((await client.query("select count(*)::int count from public.plants where id=$1", [plant])).rows[0].count, allowed ? 1 : 0, `${label} RLS read`);
      equal((await client.query("update public.plants set display_name='Updated fixture' where id=$1 returning id", [plant])).rowCount, allowed ? 1 : 0, `${label} collaborative write`);
      await assert.rejects(client.query("insert into storage.objects(bucket_id,name) values ('plant-images',$1)", [`${home}/plants/${randomUUID()}/original.jpg`]), /row-level security|permission denied/); assertions++;
      await client.query("reset role");
    }
    await sessions[0].query("set role anon");
    await assert.rejects(sessions[0].query("select * from public.plants"), /permission denied/); assertions++;
    await sessions[0].query("reset role");
    await admin.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    const customer = (await admin.query("select public.begin_household_purchase($1) customer", [home])).rows[0].customer;
    const now = new Date(), end = new Date(now.getTime() + 31 * 86_400_000), receipt = randomUUID(), event = randomUUID();
    const apply = (client, eventId, at, plan = "premium_monthly") => client.query("select public.apply_household_provider_event($1,$2,'RENEWAL',$3,'active',$4,'web',$5,$6,$7,$8,'{}') applied",
      [customer, eventId, plan, plan === "premium_yearly" ? "yearly" : "monthly", receipt, now, end, at]);
    const duplicate = await Promise.all(sessions.map(client => apply(client, event, now)));
    equal(duplicate.filter(result => result.rows[0].applied).length, 1, "duplicate concurrent event applies once");
    await Promise.all(sessions.map((client, i) => apply(client, randomUUID(), new Date(now.getTime() + (i + 1) * 1000), i === 15 ? "premium_yearly" : "premium_monthly")));
    const subscription = (await admin.query("select plan_key,last_provider_event_at from public.household_subscriptions where household_id=$1", [home])).rows[0];
    equal(subscription.plan_key, "premium_yearly", "latest subscription wins independent of arrival order");
    equal(subscription.last_provider_event_at.toISOString(), new Date(now.getTime() + 16000).toISOString(), "provider order preserved");
    // Provider reconciliation may reactivate suspended members; keep the test
    // viewer active, then remove it while its reservation waits on the home.
    const waiter = sessions[1];
    await waiter.query("select set_config('request.jwt.claim.sub',$1,false)", [viewer]);
    await admin.query("begin");
    try {
      await admin.query("select id from public.households where id=$1 for update", [home]);
      const pending = waiter.query("select public.reserve_image_upload($1,'plant',$2)", [home, randomUUID()]).then(() => ({ allowed: true }), error => ({ allowed: false, error }));
      const deadline = Date.now() + 5000;
      let waiting = false;
      while (!waiting && Date.now() < deadline) {
        waiting = (await admin.query("select exists(select 1 from pg_stat_activity where pid=$1 and wait_event_type='Lock') waiting", [pids[1]])).rows[0].waiting;
        if (!waiting) await new Promise(resolve => setImmediate(resolve));
      }
      equal(waiting, true, "reservation is blocked before membership changes");
      await admin.query("delete from public.household_members where household_id=$1 and user_id=$2", [home, viewer]);
      await admin.query("commit");
      const result = await pending;
      equal(result.allowed, false, "removed viewer cannot reserve after waiting on a household lock");
      assert.match(result.error.message, /HOUSEHOLD_ACCESS_DENIED/); assertions++;
    } finally { await admin.query("rollback"); }
    return { sessions: 16, assertions, roleCases: 7, concurrentSubscriptionEvents: 32, membershipRevocation: "PASS" };
  } finally { await Promise.allSettled(sessions.map(client => client.end())); }
};
