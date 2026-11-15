import assert from "node:assert/strict";
import { randomUUID,createHash } from "node:crypto";
import { mkdir,writeFile } from "node:fs/promises";
import { createAiTestDatabase,aiRpc } from "./lib/aiTestDatabase.mjs";
import { syntheticFacts,syntheticUsage } from "../tests/fixtures/aiEdgeHarness.mjs";
const db=await createAiTestDatabase(),{owner}=db;
let assertions=0;
const equal=(a,b,message)=>{assert.deepEqual(a,b,message);assertions++;};
const rejects=async(promise,pattern)=>{await assert.rejects(promise,pattern);assertions++;};
const hash=s=>createHash("sha256").update(s).digest("hex");
const actor=async()=>{const id=randomUUID();await owner.query("insert into auth.users(id,email) values($1,$2)",[id,`synthetic-${id}@example.invalid`]);return id;};
const run=async(ids,extra={})=>(await owner.query("insert into ai_private.vision_evaluation_runs(task_key,actor_ids,enabled,expires_at,max_attempts,max_usd) values($1,$2,true,now()+interval '30 minutes',$3,$4) returning id",[randomUUID(),ids,extra.maxAttempts??50,extra.maxUsd??"0.4"])).rows[0].id;
const input=async(run,key,profile="baseline_1600_high",purpose="probe")=>{
  const sha=hash(key);await owner.query("insert into ai_private.vision_evaluation_inputs(run_id,input_key,source_key,source_sha256,source_width,source_height,profile_id,purpose,image_sha256,image_width,image_height,encoded_bytes) values($1,$2,'synthetic',$3,1600,1600,$4,$5,$3,8,8,128)",[run,key,sha,profile,purpose]);return sha;
};
const args=(actor,sha,extra={})=>({actor,household:null,plant:null,kind:"image_validation",retry_key:randomUUID(),request_fingerprint:hash(randomUUID()),image_sha256:sha,
  model_name:"gpt-4o",prompt_schema_version:"vision-token-probe-v1",output_limit:32,image_width:8,image_height:8,
  image_detail:"high",preprocessing_profile:"vision-benchmark-v1:baseline_1600_high",encoded_image_bytes:128,...extra});
const claim=(a,client=owner)=>aiRpc(client,"ai_claim_image_operation",a);
const start=async a=>{const op=await claim(a);return{op,attempt:await aiRpc(owner,"ai_start_image_attempt",{operation:op.operationId,lease:op.leaseId})};};
const finish=(entry,facts=syntheticFacts(),outcome="COMPLETED")=>aiRpc(owner,"ai_finish_attempt",{operation:entry.op.operationId,lease:entry.op.leaseId,attempt:entry.attempt,outcome,final_result:outcome==="COMPLETED"?{probe:{containsPlant:true}}:null,facts});
const expire=async()=>{await owner.query("update ai_private.operations set lease_expires_at=now()-interval '1 second' where state in ('RESERVED','PROCESSING')");await aiRpc(owner,"ai_maintain_operations");};
try{
  await owner.query("update ai_private.control set account_per_minute=100");
  const actors=await Promise.all(Array.from({length:5},()=>actor()));
  const evaluation=await run(actors),sha=await input(evaluation,"low","d_512_low");
  const low=args(actors[0],sha,{image_detail:"low",preprocessing_profile:"vision-benchmark-v1:d_512_low",evaluation_input_key:"low"});
  equal((await aiRpc(owner,"ai_resolve_vision_input",{actor:actors[0],run:evaluation,input_key:"low"})).detail,"low");
  await rejects(claim({...low,actor:await actor()}),/AI_EVALUATION_FORBIDDEN/);
  for(const extra of [{image_sha256:hash("other")},{encoded_image_bytes:129},{image_width:9},{image_detail:"high"},{model_name:"client-forged"},{prompt_schema_version:"plant-image-safety-v1"},{output_limit:700}])await rejects(claim({...low,...extra}),/AI_EVALUATION_FORBIDDEN/);
  await rejects(claim({...low,evaluation_input_key:null}),/AI_INVALID_OPERATION/);
  const first=await start(low);await finish(first);
  equal((await claim(low)).decision,"REPLAY");
  const metadata=(await owner.query("select image_detail,preprocessing_profile,encoded_image_bytes,evaluation_run_id from ai_private.operations where id=$1",[first.op.operationId])).rows[0];
  equal(metadata,{image_detail:"low",preprocessing_profile:"vision-benchmark-v1:d_512_low",encoded_image_bytes:128,evaluation_run_id:evaluation});
  equal((await owner.query("select count(*)::int n from ai_private.attempts where operation_id=$1",[first.op.operationId])).rows[0].n,1);
  await owner.query("update ai_private.vision_evaluation_runs set enabled=false where id=$1",[evaluation]);
  await rejects(aiRpc(owner,"ai_resolve_vision_input",{actor:actors[0],run:evaluation,input_key:"low"}),/AI_EVALUATION_FORBIDDEN/);
  const regular=args(actors[0],hash("regular"),{prompt_schema_version:"plant-image-safety-v1",output_limit:700,preprocessing_profile:"normalized-jpeg-v1"});
  await rejects(claim(regular),/AI_EVALUATION_CLOSED/);

  const startActor=await actor(),startRun=await run([startActor]),startSha=await input(startRun,"start");
  const reserved=await claim(args(startActor,startSha,{evaluation_input_key:"start"}));
  await owner.query("update ai_private.vision_evaluation_runs set enabled=false where id=$1",[startRun]);
  await rejects(aiRpc(owner,"ai_start_image_attempt",{operation:reserved.operationId,lease:reserved.leaseId}),/AI_EVALUATION_CLOSED/);
  await expire();

  // One controlled batch spans accounts/devices and real independent sessions.
  const users=await Promise.all(Array.from({length:5},()=>actor())),batch=await run(users),batchSha=await input(batch,"batch");
  const sessions=await Promise.all(Array.from({length:100},()=>db.connect()));
  for(const session of sessions)await session.query("select set_config('request.jwt.claim.role','service_role',false)");
  equal(new Set((await Promise.all(sessions.map(c=>c.query("select pg_backend_pid() pid")))).map(r=>r.rows[0].pid)).size,100);
  const offers=await Promise.allSettled(sessions.map((client,i)=>claim(args(users[i%users.length],batchSha,{evaluation_input_key:"batch"}),client)));
  equal(offers.filter(r=>r.status==="fulfilled").length,1,"full-context financial reservations prevent a two-attempt $0.40 exposure race");
  equal((await owner.query("select count(*)::int n from ai_private.operations where evaluation_run_id=$1",[batch])).rows[0].n,1,"denied claims leave no orphan operations");
  const winner=offers.find(r=>r.status==="fulfilled").value;
  const winnerAttempt=await aiRpc(owner,"ai_start_image_attempt",{operation:winner.operationId,lease:winner.leaseId});
  await finish({op:winner,attempt:winnerAttempt},{failureCategory:"PROVIDER_TIMEOUT"},"UNKNOWN");
  await rejects(claim(args(users[1],batchSha,{evaluation_input_key:"batch"})),/AI_EVALUATION_LIMIT/);
  equal((await owner.query("select cost_usd,accounting_status from ai_private.attempts where id=$1",[winnerAttempt])).rows[0],{cost_usd:null,accounting_status:"UNKNOWN_USAGE"});
  await aiRpc(owner,"ai_reconcile_attempt",{attempt:winnerAttempt,verified_facts:syntheticFacts()});
  const recovered=await start(args(users[1],batchSha,{evaluation_input_key:"batch"}));
  await finish(recovered,syntheticFacts({input_tokens:32000,input_tokens_details:{cached_tokens:0},output_tokens:0,total_tokens:32000}));
  await rejects(claim(args(users[2],batchSha,{evaluation_input_key:"batch"})),/AI_EVALUATION_LIMIT/);
  equal((await owner.query("select count(*)::int n from ai_private.attempts a join ai_private.operations o on o.id=a.operation_id where o.evaluation_run_id=$1",[batch])).rows[0].n,2);

  // Zero is measured only when genuinely reported. Even zero-cost attempts
  // count towards the independent fifty-attempt ceiling.
  const zeroActor=await actor(),zeroRun=await run([zeroActor]);
  const zeroUsage={input_tokens:0,input_tokens_details:{cached_tokens:0},output_tokens:0,total_tokens:0};
  for(let i=0;i<50;i++){const key=`zero-${i}`,image=await input(zeroRun,key);await finish(await start(args(zeroActor,image,{evaluation_input_key:key})),syntheticFacts(zeroUsage));}
  const lastSha=await input(zeroRun,"zero-51");await rejects(claim(args(zeroActor,lastSha,{evaluation_input_key:"zero-51"})),/AI_EVALUATION_LIMIT/);
  equal((await owner.query("select count(*)::int n,sum(a.cost_usd)::text amount from ai_private.attempts a join ai_private.operations o on o.id=a.operation_id where o.evaluation_run_id=$1",[zeroRun])).rows[0],{n:50,amount:"0.000000000000"});
  await rejects(owner.query("update ai_private.vision_evaluation_runs set max_attempts=51 where id=$1",[zeroRun]),/check constraint/);
  await rejects(owner.query("update ai_private.vision_evaluation_runs set max_usd=0.400000000001 where id=$1",[zeroRun]),/check constraint/);

  for(const role of ["anon","authenticated"]){await owner.query(`set role ${role}`);
    await rejects(owner.query("select * from ai_private.vision_evaluation_runs"),/permission denied/);
    await rejects(owner.query("select public.ai_resolve_vision_input(null,null,null)"),/permission denied/);
    await rejects(owner.query("select public.ai_start_image_attempt(null,null)"),/permission denied/);
    await owner.query("reset role");}
  equal((await owner.query("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'ai_%' and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))")).rows[0].n,0);
  const report={status:"PASS",sessions:100,assertions,checks:["approved actor/exact-byte/dimension/profile/model/schema binding","default high-detail restriction and closed-run start denial","100-session aggregate pre-spend budget; rollback without orphan reservations","unknown financial exposure retained; trusted measured reconciliation","fifty-attempt ceiling including explicitly reported zero; USD ceiling constraints","real client-role denials and service-only RPCs"],limitation:"Disposable PostgreSQL/platform adapters; provider facts synthetic; no hosted data mutation"};
  await mkdir(".tmp-tests",{recursive:true});await writeFile(".tmp-tests/vision-postgres-results.json",JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await db.close();}
