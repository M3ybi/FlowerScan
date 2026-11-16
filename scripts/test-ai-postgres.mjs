import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { createAiTestDatabase, aiRpc } from "./lib/aiTestDatabase.mjs";
import { aiEdgeHandler, syntheticCare, syntheticFacts, syntheticUsage } from "../tests/fixtures/aiEdgeHarness.mjs";

const db = await createAiTestDatabase();
// Preserve the original GPT-4o accounting/replay regression against its exact
// compatibility adapter. Current Luna workers are exercised by test:model-postgres.
const historicalAdapter = { "supabase/functions/_shared/aiOperation.ts": execFileSync("git", ["show", "18aa79931f210f63a249988c8c7cc9ecadea8470:supabase/functions/_shared/aiOperation.ts"], { encoding: "utf8" }) };
const { owner } = db;
let assertions = 0;
const checks = [];
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); assertions++; };
const rejects = async (operation, pattern) => { await assert.rejects(operation, pattern); assertions++; };
const hash = value => createHash("sha256").update(String(value)).digest("hex");
const claimArgs = (actor, home, kind, extra = {}) => {
  const nonce = randomUUID();
  return { actor, household: home, plant: null, kind, retry_key: nonce, request_fingerprint: hash(nonce), image_sha256: hash("synthetic image"),
    model_name: "gpt-4o", prompt_schema_version: "synthetic-v1", output_limit: 1400, image_width: 100, image_height: 100, ...extra };
};
const fixture = async (premium = false) => {
  const actor = randomUUID(), home = randomUUID(), plant = randomUUID();
  await owner.query("insert into auth.users(id,email) values($1,$2)", [actor, `synthetic-${actor}@example.invalid`]);
  await owner.query("insert into public.households(id,name,created_by,premium_enabled,plan_key) values($1,'Synthetic AI fixture',$2,$3,$4)", [home, actor, premium, premium ? "premium" : "free"]);
  await owner.query("insert into public.household_members(household_id,user_id,role,status) values($1,$2,'owner','active')", [home, actor]);
  await owner.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  await owner.query("insert into public.plants(id,household_id,source,display_name,likely_name,identification,identification_note,short_care,light,watering,soil,created_by) values($1,$2,'custom','Synthetic','Synthetic','likely','','','','','',$3)", [plant, home, actor]);
  return { actor, home, plant };
};
const start = async (args, client = owner) => {
  const op = await aiRpc(client, "ai_claim_operation", args);
  assert.equal(op.decision, "RUN");
  const attempt = await aiRpc(client, "ai_start_attempt", { operation: op.operationId, lease: op.leaseId });
  return { op, attempt };
};
const finish = (entry, facts = syntheticFacts(), outcome = "COMPLETED", client = owner) => aiRpc(client, "ai_finish_attempt", {
  operation: entry.op.operationId, lease: entry.op.leaseId, attempt: entry.attempt, outcome,
  final_result: outcome === "COMPLETED" ? { care: syntheticCare } : null, facts,
});
const expireActive = async () => {
  await owner.query("update ai_private.operations set lease_expires_at=now()-interval '1 second' where state in ('RESERVED','PROCESSING')");
  await aiRpc(owner, "ai_maintain_operations");
};

try {
  const sessions = await Promise.all(Array.from({ length: 100 }, () => db.connect()));
  for (const client of sessions) await client.query("select set_config('request.jwt.claim.role','service_role',false)");
  const pids = await Promise.all(sessions.map(async client => (await client.query("select pg_backend_pid() pid")).rows[0].pid));
  equal(new Set(pids).size, 100, "100 genuinely independent PostgreSQL sessions");

  // Exercise production Edge code across independent workers, not merely SQL.
  const fixtureBundle = await build({ entryPoints: ["tests/fixtures/imagePayload.ts"], bundle: true, write: false, format: "esm" });
  const { fixtureDataUrl } = await import(`data:text/javascript;base64,${Buffer.from(fixtureBundle.outputFiles[0].text).toString("base64")}`);
  await owner.query("update ai_private.control set account_per_minute=100");
  const free = await fixture();
  const body = { householdId: free.home, plantId: free.plant, generationSource: "manual_refresh", plantName: "Synthetic", imageDataUrl: fixtureDataUrl(), language: "en" };
  let providerCalls = 0, otherResponses = 0, releaseProvider;
  const providerGate = new Promise(resolve => { releaseProvider = resolve; });
  const handlers = [];
  for (const client of sessions) handlers.push(await aiEdgeHandler("plant-care-ai", {
    sourceOverrides: historicalAdapter,
    actorId: free.actor, rpc: async (name, args) => { try { return await aiRpc(client, name, args); } catch (error) { if (client === sessions[0]) console.error("Synthetic RPC failure", name, error.message); throw error; } },
    fetch: async (_url, init) => {
      providerCalls++;
      const request = JSON.parse(init.body);
      equal(request.model, "gpt-4o", "active model remains unchanged");
      equal(request.service_tier, "default");
      await providerGate;
      return Response.json({ id: "resp_fixture", model: "gpt-4o-2024-08-06", service_tier: "default", status: "completed", usage: syntheticUsage, output_text: JSON.stringify(syntheticCare) });
    },
  }));
  const requests = handlers.map(handler => handler(body).then(response => {
    if (response.status !== 200 && ++otherResponses === 99) releaseProvider();
    return response;
  }));
  const responses = await Promise.all(requests);
  equal(providerCalls, 1, "100 concurrent actual Edge handlers initiate exactly one provider call");
  equal(responses.filter(response => response.status === 200).length, 1);
  equal(responses.filter(response => response.status === 409).length, 99);
  equal((await handlers[0](body)).status, 200, "old client safely retrieves a completed response");
  equal(providerCalls, 1);
  equal((await owner.query("select count(*)::int n from public.plant_care_tip_generations where household_id=$1 and generation_source='manual_refresh'", [free.home])).rows[0].n, 1);
  equal((await owner.query("select count(*)::int n from ai_private.attempts")).rows[0].n, 1);
  const completedOp = (await owner.query("select id,lease_id from ai_private.operations where household_id=$1", [free.home])).rows[0];
  await rejects(aiRpc(owner, "ai_start_attempt", { operation: completedOp.id, lease: completedOp.lease_id }), /AI_OPERATION_UNAVAILABLE/);
  checks.push("100 simultaneous Edge refreshes: one inference, one settlement, safe replay");

  // Different fingerprints/keys compete for the same Free daily slot.
  const competing = await fixture();
  await owner.query("update ai_private.control set account_concurrency=10,household_concurrency=20,global_concurrency=100");
  const outcomes = await Promise.allSettled(sessions.map(client => aiRpc(client, "ai_claim_operation", claimArgs(competing.actor, competing.home, "care_refresh", { plant: competing.plant }))));
  equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
  equal(outcomes.filter(result => result.status === "rejected" && /AI_CARE_LIMIT/.test(result.reason.message)).length, 99);
  await expireActive();
  const recovered = await start(claimArgs(competing.actor, competing.home, "care_refresh", { plant: competing.plant }));
  await finish(recovered);
  checks.push("100 distinct competing refresh operations: one eligible reservation, no deadlock");

  // Initial creation remains tied to unfinished creation, including old clients.
  const initial = await fixture(true);
  const initialArgs = claimArgs(initial.actor, initial.home, "initial_care");
  const initialEntry = await start(initialArgs); await finish(initialEntry);
  equal((await aiRpc(owner, "ai_claim_operation", initialArgs)).decision, "REPLAY", "failed save retry recovers care without another inference");
  equal((await aiRpc(owner, "ai_claim_operation", { ...initialArgs, retry_key: randomUUID() })).decision, "REPLAY", "changing retry keys cannot evade identical-image request identity");
  const second = await start(claimArgs(initial.actor, initial.home, "initial_care")); await finish(second);
  const third = await start(claimArgs(initial.actor, initial.home, "initial_care")); await finish(third);
  await rejects(aiRpc(owner, "ai_claim_operation", claimArgs(initial.actor, initial.home, "initial_care")), /AI_PENDING_PLANTS/);
  const imageId = randomUUID(), path = `${initial.home}/plants/${imageId}/original.jpg`;
  await aiRpc(owner, "ai_bind_uploaded_image", { actor: initial.actor, household: initial.home, object_path: path, image_sha256: initialArgs.image_sha256 });
  await owner.query("select set_config('request.jwt.claim.sub',$1,false)", [initial.actor]);
  await owner.query("insert into public.plants(household_id,source,display_name,likely_name,identification,identification_note,short_care,light,watering,soil,image_path,created_by) values($1,'custom','Synthetic saved','Synthetic','likely','','','','','',$2,$3)", [initial.home, path, initial.actor]);
  equal((await owner.query("select linked_plant_id is not null bound from ai_private.operations where id=$1", [initialEntry.op.operationId])).rows[0].bound, true);
  equal((await aiRpc(owner, "ai_claim_operation", claimArgs(initial.actor, initial.home, "initial_care"))).decision, "RUN", "saving frees pending capacity without imposing a Premium monthly quota");
  await expireActive();
  await owner.query("update ai_private.operations set expires_at=now()-interval '1 second' where household_id=$1", [initial.home]);
  await aiRpc(owner, "ai_maintain_operations");
  equal((await aiRpc(owner, "ai_claim_operation", initialArgs)).decision, "RUN", "expired pending operation can be restarted under normal admission");
  await expireActive();
  checks.push("initial replay, manipulated keys, pending cap, failed-save recovery, persisted-plant binding and expiry");

  // Returned usage is authoritative; integer SQL numeric math never adds cached
  // input or reasoning tokens a second time.
  const priceUser = await fixture(true);
  const priceCases = [
    [syntheticUsage, "0.003250000000"],
    [{ input_tokens: 0, input_tokens_details: { cached_tokens: 0 }, output_tokens: 0, total_tokens: 0 }, "0.000000000000"],
    [{ input_tokens: 1, input_tokens_details: { cached_tokens: 0 }, output_tokens: 1, total_tokens: 2 }, "0.000012500000"],
    [{ input_tokens: 100000, input_tokens_details: { cached_tokens: 50000 }, output_tokens: 10000, output_tokens_details: { reasoning_tokens: 9000 }, total_tokens: 110000 }, "0.287500000000"],
  ];
  for (const [usage, expected] of priceCases) {
    const entry = await start(claimArgs(priceUser.actor, priceUser.home, "diagnosis"));
    const settled = await finish(entry, syntheticFacts(usage));
    equal(settled.costUsd, expected);
    equal(settled.accountingStatus, "MEASURED");
    const repeated = await Promise.all(sessions.map(client => finish(entry, syntheticFacts(usage), "COMPLETED", client)));
    equal(repeated.every(value => value.state === "COMPLETED"), true, "concurrent completion is idempotent");
    equal((await owner.query("select count(*)::int n from ai_private.attempts where operation_id=$1", [entry.op.operationId])).rows[0].n, 1);
  }
  for (const usage of [undefined, {}, { ...syntheticUsage, input_tokens_details: {} }, { ...syntheticUsage, input_tokens_details: { cached_tokens: 1001 } }, { ...syntheticUsage, total_tokens: -1 }]) {
    const entry = await start(claimArgs(priceUser.actor, priceUser.home, "diagnosis"));
    const settled = await finish(entry, { ...syntheticFacts(), usage });
    equal(settled.accountingStatus, "UNKNOWN_USAGE"); equal(settled.costUsd, null);
    const reconciled = await aiRpc(owner, "ai_reconcile_attempt", { attempt: entry.attempt, verified_facts: syntheticFacts() });
    equal(reconciled.costUsd, "0.003250000000");
    equal((await owner.query("select state from ai_private.operations where id=$1", [entry.op.operationId])).rows[0].state, "COMPLETED", "financial reconciliation preserves terminal state");
  }
  const unknown = await start(claimArgs(priceUser.actor, priceUser.home, "diagnosis"));
  equal((await finish(unknown, { ...syntheticFacts(), model: "unregistered-model" })).accountingStatus, "UNKNOWN_PRICING");
  await aiRpc(owner, "ai_reconcile_attempt", { attempt: unknown.attempt, verified_facts: syntheticFacts() });
  await rejects(aiRpc(owner, "ai_claim_operation", claimArgs(priceUser.actor, priceUser.home, "diagnosis", { model_name: "unregistered-model" })), /AI_PRICING_UNAVAILABLE/);
  const oldPrice = await start(claimArgs(priceUser.actor, priceUser.home, "diagnosis"));
  await owner.query("insert into ai_private.prices select 'synthetic-next-price',model,service_tier,now(),input_usd_per_million*2,cached_usd_per_million*2,output_usd_per_million*2,context_tokens,source_url from ai_private.prices where version='openai-standard-2026-11-15'");
  equal((await finish(oldPrice)).costUsd, "0.003250000000", "in-flight attempt retains its pricing version");
  const newPrice = await start(claimArgs(priceUser.actor, priceUser.home, "diagnosis"));
  equal((await finish(newPrice)).costUsd, "0.006500000000");
  await owner.query("delete from ai_private.prices where version='synthetic-next-price'");
  const sum = await owner.query("select sum(cost_usd)::text total from ai_private.attempts where operation_id in ($1,$2)", [oldPrice.op.operationId, newPrice.op.operationId]);
  equal(sum.rows[0].total, "0.009750000000", "decimal aggregation remains exact");
  // Exercise the one-to-many ledger independently of the live one-attempt
  // policy. Only this disposable administrator fixture rearms the operation;
  // no production RPC or client can enable inference retries this way.
  const multi = await fixture(true);
  const firstAttempt = await start(claimArgs(multi.actor,multi.home,"diagnosis"));
  await finish(firstAttempt,syntheticFacts(),"FAILED");
  const rearmed = (await owner.query("update ai_private.operations set state='RESERVED',max_attempts=2,lease_id=gen_random_uuid(),lease_expires_at=now()+interval '90 seconds',expires_at=now()+interval '15 minutes' where id=$1 returning lease_id",[firstAttempt.op.operationId])).rows[0];
  const secondAttempt = {op:{operationId:firstAttempt.op.operationId,leaseId:rearmed.lease_id},attempt:await aiRpc(owner,"ai_start_attempt",{operation:firstAttempt.op.operationId,lease:rearmed.lease_id})};
  await finish(secondAttempt);
  equal((await owner.query("select count(*)::int n,sum(cost_usd)::text cost from ai_private.attempts where operation_id=$1",[firstAttempt.op.operationId])).rows[0],{n:2,cost:"0.006500000000"},"each attempted inference contributes once to the same operation's financial total");
  equal((await finish(secondAttempt)).state,"COMPLETED","repeated final settlement preserves both attempt records");
  await rejects(aiRpc(owner,"ai_start_attempt",{operation:secondAttempt.op.operationId,lease:secondAttempt.op.leaseId}),/AI_OPERATION_UNAVAILABLE/);
  checks.push("zero/small/large/cached/reasoning/missing/invalid usage; unknown pricing; version changes; multi-attempt ledger fixture; exact precision and concurrent settlement");

  // Existing monthly counters are reserved/released/committed in the same SQL
  // transaction as the operation, including lost workers and revoked access.
  const monthly = await fixture();
  const denied = await start(claimArgs(monthly.actor, monthly.home, "diagnosis"));
  await owner.query("update public.household_members set status='suspended_plan_limit' where household_id=$1", [monthly.home]);
  equal((await finish(denied)).state, "FAILED");
  equal((await owner.query("select used_count,reserved_count from public.household_usage_counters where household_id=$1", [monthly.home])).rows[0], { used_count: 0, reserved_count: 0 });
  await rejects(aiRpc(owner, "ai_claim_operation", claimArgs(monthly.actor, monthly.home, "diagnosis")), /HOUSEHOLD_ACCESS_DENIED/);
  await owner.query("update public.household_members set status='active' where household_id=$1", [monthly.home]);
  const lost = await start(claimArgs(monthly.actor, monthly.home, "diagnosis"));
  await expireActive();
  equal((await owner.query("select state from ai_private.operations where id=$1", [lost.op.operationId])).rows[0].state, "UNKNOWN");
  equal((await owner.query("select reserved_count from public.household_usage_counters where household_id=$1", [monthly.home])).rows[0].reserved_count, 0);
  await aiRpc(owner, "ai_reconcile_attempt", { attempt: lost.attempt, verified_facts: syntheticFacts() });
  for (let i = 0; i < 5; i++) await finish(await start(claimArgs(monthly.actor, monthly.home, "diagnosis")));
  await rejects(aiRpc(owner, "ai_claim_operation", claimArgs(monthly.actor, monthly.home, "diagnosis")), /AI_DIAGNOSIS_LIMIT/);
  equal((await owner.query("select used_count,reserved_count from public.household_usage_counters where household_id=$1", [monthly.home])).rows[0], { used_count: 5, reserved_count: 0 });
  const outsider = await fixture();
  await rejects(aiRpc(owner, "ai_claim_operation", { ...initialArgs, actor: outsider.actor }), /HOUSEHOLD_ACCESS_DENIED/);
  const beforeStart = await aiRpc(owner, "ai_claim_operation", claimArgs(outsider.actor, outsider.home, "care_refresh", { plant: outsider.plant }));
  await owner.query("delete from public.household_members where household_id=$1", [outsider.home]);
  await rejects(aiRpc(owner, "ai_start_attempt", { operation: beforeStart.operationId, lease: beforeStart.leaseId }), /HOUSEHOLD_ACCESS_DENIED/);
  await expireActive();
  const waitingMember = await fixture();
  await owner.query("begin");
  await owner.query("select id from public.households where id=$1 for update",[waitingMember.home]);
  const waiter = aiRpc(sessions[0],"ai_claim_operation",claimArgs(waitingMember.actor,waitingMember.home,"care_refresh",{plant:waitingMember.plant})).then(value=>({value}),error=>({error}));
  let blocked = false;
  const deadline = Date.now()+5000;
  while(!blocked && Date.now()<deadline) {
    blocked = (await owner.query("select exists(select 1 from pg_stat_activity where pid=$1 and wait_event_type='Lock') waiting",[pids[0]])).rows[0].waiting;
    if(!blocked) await new Promise(resolve=>setImmediate(resolve));
  }
  equal(blocked,true,"claim actually waits on an independent household transaction");
  await owner.query("update public.household_members set status='suspended_plan_limit' where household_id=$1",[waitingMember.home]);
  await owner.query("commit");
  const revoked = await waiter;
  assert.match(revoked.error?.message ?? "",/HOUSEHOLD_ACCESS_DENIED/); assertions++;
  checks.push("Free monthly allowance, lost-worker quota release, uncertainty, authorization revocation before/after inference, cross-household denial");

  // Global/account/household concurrency is shared by all independent sessions.
  await owner.query("update ai_private.control set account_concurrency=1,household_concurrency=2,global_concurrency=8,account_per_minute=100");
  const busy = await fixture(true);
  const sameAccount = await Promise.allSettled(sessions.map(client => aiRpc(client, "ai_claim_operation", claimArgs(busy.actor, busy.home, "diagnosis"))));
  equal(sameAccount.filter(result => result.status === "fulfilled").length, 1);
  await expireActive();
  const users = [];
  for (let i = 0; i < 100; i++) users.push(await fixture(true));
  const manyAccounts = await Promise.allSettled(sessions.map((client, index) => aiRpc(client, "ai_claim_operation", claimArgs(users[index].actor, users[index].home, "diagnosis", { image_sha256: hash(`unique synthetic image ${index}`) }))));
  equal(manyAccounts.filter(result => result.status === "fulfilled").length, 8);
  await expireActive();
  await owner.query("insert into public.household_members(household_id,user_id,role,status) values($1,$2,'viewer','active')", [busy.home,users[0].actor]);
  await owner.query("update ai_private.control set account_concurrency=10");
  const sameHousehold = await Promise.allSettled(sessions.map((client,index) => aiRpc(client,"ai_claim_operation",claimArgs(index % 2 ? busy.actor : users[0].actor,busy.home,"diagnosis"))));
  equal(sameHousehold.filter(result => result.status === "fulfilled").length, 2, "100 requests from two accounts/devices share household concurrency");
  await expireActive();
  await owner.query("update ai_private.control set account_concurrency=1,account_per_minute=1");
  const rateUser = await fixture(true);
  const rateArgs = claimArgs(rateUser.actor,rateUser.home,"diagnosis");
  await finish(await start(rateArgs));
  await rejects(aiRpc(owner,"ai_claim_operation",claimArgs(rateUser.actor,rateUser.home,"diagnosis")),/AI_RATE_LIMITED/);
  equal((await aiRpc(owner,"ai_claim_operation",rateArgs)).decision,"REPLAY","throttling must not hide an already purchased result");
  await owner.query("update ai_private.control set account_per_minute=100");
  const hourly = await fixture(true);
  for(let i=0;i<30;i++) await finish(await start(claimArgs(hourly.actor,hourly.home,"diagnosis")));
  await rejects(aiRpc(owner,"ai_claim_operation",claimArgs(hourly.actor,hourly.home,"diagnosis")),/IMAGE_RATE_LIMITED/);
  const aggregationIds = [];
  for(const user of users) { const entry = await start(claimArgs(user.actor,user.home,"diagnosis")); await finish(entry); aggregationIds.push(entry.op.operationId); }
  equal((await owner.query("select sum(cost_usd)::text total from ai_private.attempts where operation_id=any($1::uuid[])",[aggregationIds])).rows[0].total,"0.325000000000","100 measured scans aggregate without floating-point drift");
  await owner.query("update ai_private.control set paused=true");
  await rejects(aiRpc(owner, "ai_claim_operation", claimArgs(busy.actor, busy.home, "diagnosis")), /AI_CIRCUIT_OPEN/);
  await owner.query("update ai_private.control set paused=false,inflight_limit_usd=0.01");
  await rejects(aiRpc(owner, "ai_claim_operation", claimArgs(busy.actor, busy.home, "diagnosis")), /AI_CIRCUIT_OPEN/);
  await owner.query("update ai_private.control set inflight_limit_usd=5");
  // A measured spending spike must block fresh work even with no active lease.
  await owner.query("update ai_private.control set daily_emergency_usd=0.01");
  await rejects(aiRpc(owner, "ai_claim_operation", claimArgs(busy.actor, busy.home, "diagnosis")), /AI_CIRCUIT_OPEN/);
  await owner.query("update ai_private.control set daily_emergency_usd=25,monthly_emergency_usd=0.01");
  await rejects(aiRpc(owner, "ai_claim_operation", claimArgs(busy.actor, busy.home, "diagnosis")), /AI_CIRCUIT_OPEN/);
  await owner.query("update ai_private.control set monthly_emergency_usd=100");
  let timeoutAttempts = 0;
  for (let i = 0; i < 100; i++) {
    try { const entry = await start(claimArgs(users[i].actor, users[i].home, "diagnosis")); await finish(entry, { failureCategory: "PROVIDER_TIMEOUT" }, "UNKNOWN"); timeoutAttempts++; }
    catch (error) { assert.match(error.message, /AI_CIRCUIT_OPEN/); }
  }
  equal(timeoutAttempts > 0 && timeoutAttempts < 100, true);
  const held = (await owner.query("select coalesce(sum(exposure_usd),0)::text exposure from ai_private.attempts where accounting_status<>'MEASURED'")).rows[0].exposure;
  equal(Number(held) <= 5, true, "timeouts retain bounded global exposure rather than resetting to zero");
  checks.push("100-account unique-image flood, 100 same-account and same-household/device requests, minute/hour throttles, 100-scan decimal aggregation, daily/monthly spending spikes, circuit breaker and 100-timeout storm");

  // Role tests execute as actual restricted database roles, not just claims.
  for (const role of ["anon", "authenticated"]) {
    await owner.query(`set role ${role}`);
    await rejects(owner.query("select * from ai_private.attempts"), /permission denied/);
    await rejects(owner.query("update ai_private.control set paused=false"), /permission denied/);
    await rejects(owner.query("select public.ai_maintain_operations()"), /permission denied/);
    await owner.query("reset role");
  }
  await owner.query("set role service_role");
  await aiRpc(owner,"ai_maintain_operations");
  await rejects(owner.query("update ai_private.control set paused=false"),/permission denied/);
  await owner.query("reset role");
  const grants = await owner.query("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'ai_%' and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))");
  equal(grants.rows, []);
  equal((await owner.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='ai_private' and c.relkind='r' and not c.relrowsecurity")).rows[0].n, 0);
  checks.push("real anon/authenticated role denials, RLS and service-only RPC grants");

  const report = { status: "PASS", postgres: (await owner.query("show server_version")).rows[0].server_version, sessions: 100, assertions, checks,
    limitation: "Real PostgreSQL with explicit local Auth/Storage/Vault SQL fixtures; no external provider calls or hosted mutations." };
  await mkdir(".tmp-tests", { recursive: true });
  await writeFile(".tmp-tests/ai-postgres-results.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await db.close(); }
