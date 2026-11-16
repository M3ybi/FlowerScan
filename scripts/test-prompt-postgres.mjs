import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import {build} from "esbuild";
import {execFileSync} from "node:child_process";
import {createAiTestDatabase,aiRpc} from "./lib/aiTestDatabase.mjs";
import {aiEdgeHandler,syntheticCare,syntheticFacts,syntheticUsage} from "../tests/fixtures/aiEdgeHarness.mjs";
const db=await createAiTestDatabase(),{owner}=db;
let assertions=0;
const equal=(a,b,message)=>{assert.deepEqual(a,b,message);assertions++;};
const rejects=async(promise,pattern)=>{await assert.rejects(promise,pattern);assertions++;};
const hash=s=>createHash("sha256").update(s).digest("hex");
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:"ts",contents:'export * from "./supabase/functions/_shared/botanicalPromptCandidates.ts";export * from "./tests/fixtures/imagePayload.ts";'},bundle:true,write:false,format:"esm"});
const api=await import("data:text/javascript;base64,"+Buffer.from(bundle.outputFiles[0].text).toString("base64"));
// Preserve concurrency/financial regression coverage for immutable historical
// contracts. The current endpoint is retired and tested separately as 410.
const sourceOverrides=Object.fromEntries(["supabase/functions/prompt-evaluation/index.ts","supabase/functions/_shared/aiOperation.ts"].map(path=>[path,execFileSync("git",["show",`18aa79931f210f63a249988c8c7cc9ecadea8470:${path}`],{encoding:"utf8"})]));
try{
 const actor=randomUUID(),viewer=randomUUID(),stranger=randomUUID(),home=randomUUID(),plant=randomUUID();
 for(const id of [actor,viewer,stranger])await owner.query("insert into auth.users(id,email) values($1,$2)",[id,`synthetic-${id}@example.invalid`]);
 await owner.query("insert into public.households(id,name,created_by,premium_enabled,plan_key) values($1,'Synthetic prompt evaluation',$2,true,'premium')",[home,actor]);
 await owner.query("insert into public.household_members(household_id,user_id,role,status) values($1,$2,'owner','active'),($1,$3,'viewer','active')",[home,actor,viewer]);
 await owner.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
 await owner.query("insert into public.plants(id,household_id,source,display_name,likely_name,identification,identification_note,short_care,light,watering,soil,created_by) values($1,$2,'custom','Synthetic','Synthetic','likely','','','','','',$3)",[plant,home,actor]);
 const run=(await owner.query("insert into ai_private.vision_evaluation_runs(task_key,actor_ids,enabled,expires_at) values($1,$2,true,now()+interval '30 minutes') returning id",[randomUUID(),[actor,viewer,stranger]])).rows[0].id;
 const definition=api.getBotanicalPromptDefinition("care_balanced"),context={plantName:"Ficus",symptomNotes:"Unverified context",language:"en"};
 const definitionHash=await api.botanicalDefinitionHash(definition),contextHash=await api.botanicalContextHash(context),imageDataUrl=api.fixtureDataUrl();
 const image=Buffer.from(imageDataUrl.split(",")[1],"base64"),version=api.evaluationPromptVersion(definition,"en",1400,run);
 await owner.query("insert into ai_private.prompt_evaluation_inputs(run_id,input_key,definition_id,definition_hash,context_hash,language,prompt_version,household_id,plant_id,operation_type,output_limit,image_sha256,image_width,image_height,encoded_bytes) values($1,'sample',$2,$3,$4,'en',$5,$6,$7,'care_refresh',1400,$8,2,3,$9)",[run,definition.id,definitionHash,contextHash,version,home,plant,hash(image),image.length]);
 const base={actor,household:home,plant,kind:"care_refresh",retry_key:"sample",request_fingerprint:hash("sample"),image_sha256:hash(image),model_name:"gpt-4o",prompt_schema_version:version,output_limit:1400,image_width:2,image_height:3,image_detail:"high",preprocessing_profile:"normalized-jpeg-v1",encoded_image_bytes:image.length,evaluation_run:run,evaluation_input_key:"sample",definition_hash:definitionHash,context_hash:contextHash};
 const claim=(extra={},client=owner)=>aiRpc(client,"ai_claim_prompt_operation",{...base,...extra});
 equal((await aiRpc(owner,"ai_resolve_prompt_input",{actor,run,input_key:"sample"})).definitionId,definition.id);
 await rejects(aiRpc(owner,"ai_resolve_prompt_input",{actor:stranger,run,input_key:"sample"}),/HOUSEHOLD_ACCESS_DENIED/);
 for(const extra of [{actor:randomUUID()},{household:randomUUID()},{household:null},{plant:randomUUID()},{plant:null},{kind:"initial_care"},{model_name:"other"},{model_name:null},{image_detail:"low"},{image_detail:null},{preprocessing_profile:"other"},{output_limit:1},{image_sha256:hash("other")},{image_width:3},{image_height:2},{encoded_image_bytes:image.length+1},{encoded_image_bytes:null},{prompt_schema_version:"new-version"},{definition_hash:hash("other")},{definition_hash:null},{context_hash:hash("other")},{context_hash:null},{evaluation_input_key:"other"}])await rejects(claim(extra),/AI_EVALUATION_FORBIDDEN/);
 equal((await owner.query("select count(*)::int n from ai_private.operations")).rows[0].n,0,"rejected registrations cannot reserve or bill");
 await owner.query("update ai_private.control set paused=true where singleton");await rejects(claim(),/AI_CIRCUIT_OPEN/);await owner.query("update ai_private.control set paused=false,account_per_minute=100 where singleton");

 const sessions=await Promise.all(Array.from({length:100},()=>db.connect()));
 for(const client of sessions)await client.query("select set_config('request.jwt.claim.role','service_role',false)");
 equal(new Set((await Promise.all(sessions.map(c=>c.query("select pg_backend_pid() pid")))).map(x=>x.rows[0].pid)).size,100);
 let providerCalls=0,otherResponses=0,release;
 const gate=new Promise(resolve=>{release=resolve;});
 const handlers=[];
 for(const client of sessions)handlers.push(await aiEdgeHandler("prompt-evaluation",{actorId:actor,sourceOverrides,rpc:(name,args)=>aiRpc(client,name,args),fetch:async(_url,init)=>{
  providerCalls++;const payload=JSON.parse(init.body);assert.equal(payload.model,"gpt-4o");assert.equal(payload.input[0].content[0].detail,"high");await gate;
  return Response.json({id:"resp_fixture",model:"gpt-4o-2024-08-06",service_tier:"default",status:"completed",usage:syntheticUsage,output_text:JSON.stringify(syntheticCare)});
 }}));
 const body={runId:run,inputKey:"sample",imageDataUrl,...context};
 const pending=Promise.all(handlers.map(h=>h(body).then(r=>{if(r.status!==200&&++otherResponses===99)release();return r;})));
 let timer;const responses=await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error("Concurrent prompt fixture did not settle")),20000);})]).finally(()=>{clearTimeout(timer);release();});
 equal(providerCalls,1,"one paid attempt across one hundred actual Edge workers");equal(responses.filter(r=>r.status===200).length,1);equal(responses.filter(r=>r.status===409).length,99);
 const first=(await owner.query("select o.id,o.lease_id,a.id attempt from ai_private.operations o join ai_private.attempts a on a.operation_id=o.id")).rows[0];
 const replay=await handlers[0](body);equal(replay.status,200);equal(providerCalls,1);
 equal((await owner.query("select accounting_status,cost_usd::text from ai_private.attempts where id=$1",[first.attempt])).rows[0],{accounting_status:"MEASURED",cost_usd:"0.003250000000"});
 const ordinary={...base,kind:"care_refresh",retry_key:"ordinary",request_fingerprint:hash("ordinary"),prompt_schema_version:"plant-care-v1"};
 const{evaluation_run,evaluation_input_key,definition_hash,context_hash,...normal}=ordinary;
 const normalClaim=await aiRpc(owner,"ai_claim_image_operation",{...normal,evaluation_input_key:null});equal(normalClaim.decision,"RUN");
 equal((await owner.query("select evaluation_run_id from ai_private.operations where id=$1",[normalClaim.operationId])).rows[0].evaluation_run_id,run,"ordinary smoke work shares the same aggregate run budget");
 await rejects(claim({actor:viewer,retry_key:randomUUID(),request_fingerprint:hash(randomUUID())}),/AI_EVALUATION_LIMIT/);
 await owner.query("update ai_private.operations set lease_expires_at=now()-interval '1 second' where state='RESERVED'");await aiRpc(owner,"ai_maintain_operations");
 const offered=await Promise.allSettled(sessions.map((c,i)=>claim({actor:i%2?viewer:actor,retry_key:randomUUID(),request_fingerprint:hash(randomUUID())},c)));
 equal(offered.filter(x=>x.status==="fulfilled").length,1,"one aggregate full-context reservation across different approved actors/devices");
 const winner=offered.find(x=>x.status==="fulfilled").value;
 const attempt=await aiRpc(owner,"ai_start_image_attempt",{operation:winner.operationId,lease:winner.leaseId});
 await aiRpc(owner,"ai_finish_attempt",{operation:winner.operationId,lease:winner.leaseId,attempt,outcome:"UNKNOWN",final_result:null,facts:{failureCategory:"PROVIDER_TIMEOUT"}});
 await rejects(claim({retry_key:randomUUID(),request_fingerprint:hash(randomUUID())}),/AI_EVALUATION_LIMIT/);
 equal((await owner.query("select cost_usd,accounting_status from ai_private.attempts where id=$1",[attempt])).rows[0],{cost_usd:null,accounting_status:"UNKNOWN_USAGE"});
 await aiRpc(owner,"ai_reconcile_attempt",{attempt,verified_facts:syntheticFacts()});
 const reserved=await claim({retry_key:randomUUID(),request_fingerprint:hash(randomUUID())});equal(reserved.decision,"RUN");
 await owner.query("update ai_private.vision_evaluation_runs set enabled=false where id=$1",[run]);
 await rejects(aiRpc(owner,"ai_start_image_attempt",{operation:reserved.operationId,lease:reserved.leaseId}),/AI_EVALUATION_CLOSED/);
 await rejects(aiRpc(owner,"ai_resolve_prompt_input",{actor,run,input_key:"sample"}),/AI_EVALUATION_FORBIDDEN/);
 for(const role of ["anon","authenticated"]){await owner.query(`set role ${role}`);await rejects(owner.query("select * from ai_private.prompt_evaluation_inputs"),/permission denied/);await rejects(owner.query("select public.ai_resolve_prompt_input(null,null,null)"),/permission denied/);await owner.query("reset role");}
 const report={status:"PASS",sessions:100,assertions,checks:["registered exact context/image/definition/version/configuration and current household authorization","server pause and aggregate budget shared with ordinary smoke work","100 actual Edge workers: one inference/settlement then replay","100 cross-actor reservations: one full-context admission, rollback without unmetered attempts","unknown financial exposure retained and trusted reconciliation","closed-run start denial, client-role table/RPC denials"],limitation:"Disposable PostgreSQL/platform adapters; provider boundary synthetic; no hosted mutation or botanical quality evidence"};
 await mkdir(".tmp-tests",{recursive:true});await writeFile(".tmp-tests/prompt-postgres-results.json",JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await db.close();}
