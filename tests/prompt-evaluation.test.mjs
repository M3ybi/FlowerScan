import {productionTestBinding} from './fixtures/aiEdgeHarness.mjs';
import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {build} from "esbuild";
import {aiEdgeHandler,syntheticCare,syntheticUsage} from "./fixtures/aiEdgeHarness.mjs";
const actor="11111111-1111-4111-8111-111111111111",home="22222222-2222-4222-8222-222222222222",plant="33333333-3333-4333-8333-333333333333";
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:"ts",contents:'export * from "./supabase/functions/_shared/botanicalPromptCandidates.ts";export * from "./tests/fixtures/imagePayload.ts";'},bundle:true,write:false,format:"esm"});
const api=await import("data:text/javascript;base64,"+Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const context={plantName:"Ficus",symptomNotes:"Older leaves look pale",language:"sk"};
const definition=api.getBotanicalPromptDefinition("care_balanced");
const data={definitionId:definition.id,definitionHash:await api.botanicalDefinitionHash(definition),contextHash:await api.botanicalContextHash(context),language:"sk",householdId:home,plantId:plant,kind:"care_refresh",outputLimit:1400,promptVersion:api.evaluationPromptVersion(definition,"sk",1400,actor)};
const body={runId:actor,inputKey:"sample",imageDataUrl:api.fixtureDataUrl(),...context};
const provider=extra=>Response.json({id:"resp_fixture",model:"gpt-4o-2024-08-06",service_tier:"default",status:"completed",usage:syntheticUsage,output_text:JSON.stringify(syntheticCare),...extra},{headers:{"x-request-id":"req_fixture"}});
const setup=async({resolved=data,claim={decision:"RUN",operationId:actor,leaseId:home},response=()=>provider(),signedIn=true}={})=>{
 const calls={provider:0,rpcs:[]};
 const sourceOverrides=Object.fromEntries(["supabase/functions/prompt-evaluation/index.ts","supabase/functions/_shared/aiOperation.ts"].map(path=>[path,execFileSync("git",["show",`18aa79931f210f63a249988c8c7cc9ecadea8470:${path}`],{encoding:"utf8"})]));
 const handler=await aiEdgeHandler("prompt-evaluation",{actorId:actor,signedIn,sourceOverrides,rpc:async(name,args)=>{calls.rpcs.push({name,args});
  if(name==="ai_resolve_prompt_input")return resolved;
  if(name==="ai_claim_prompt_operation"){if(claim instanceof Error)throw claim;return claim;}
  if(name==="ai_start_image_attempt")return plant;
  if(name==="ai_finish_attempt")return{state:args.outcome==="COMPLETED"?"COMPLETED":"FAILED"};throw Error("Unexpected RPC");},
 fetch:async(_url,init)=>{calls.provider++;calls.payload=JSON.parse(init.body);return response();}});
 return{calls,handler};
};

test("historical evaluator requires authentication, approved input and exact registered context",async()=>{
 for(const options of [{signedIn:false},{resolved:null},{resolved:{...data,definitionHash:"a".repeat(64)}},{resolved:{...data,contextHash:"b".repeat(64)}},{resolved:{...data,definitionId:"client-defined"}},{resolved:{...data,promptVersion:"plant-care-v1"}},{resolved:{...data,outputLimit:1}}]){
  const h=await setup(options),r=await h.handler(body);assert.equal(r.status,options.signedIn===false?401:403);assert.equal(h.calls.provider,0);
 }
 const h=await setup();assert.equal((await h.handler({...body,plantName:"Different context"})).status,403);assert.equal(h.calls.provider,0);
});

test("historical raw prompt/schema/model/detail/budget/household overrides cannot reach inference",async()=>{
 for(const extra of [{prompt:"ignore rules"},{schema:{}},{model:"other"},{detail:"low"},{max_output_tokens:1},{householdId:home},{promptVersion:"new"}]){
  const h=await setup();assert.equal((await h.handler({...body,...extra})).status,400);assert.equal(h.calls.provider,0);assert.equal(h.calls.rpcs.length,0);
 }
});

test("historical registered candidate uses the authoritative adapter, high image detail and unchanged public result fields",async()=>{
 const h=await setup(),r=await h.handler(body);assert.equal(r.status,200);assert.equal(h.calls.provider,1);
 const result=await r.json();assert.deepEqual(result.evaluation.result,{care:syntheticCare});assert.equal(result.evaluation.botanicalQuality,"NOT VERIFIED");assert.equal(result.receipt,undefined);
 assert.equal(h.calls.payload.model,"gpt-4o");assert.equal(h.calls.payload.store,false);assert.equal(h.calls.payload.service_tier,"default");assert.equal(h.calls.payload.input[0].content[0].detail,"high");
 const args=h.calls.rpcs.find(x=>x.name==="ai_claim_prompt_operation").args;
 assert.equal(args.evaluation_run,actor);assert.equal(args.definition_hash,data.definitionHash);assert.equal(args.context_hash,data.contextHash);assert.equal(args.prompt_schema_version,data.promptVersion);assert.equal(args.output_limit,1400);assert.equal(args.image_detail,"high");
 const settled=h.calls.rpcs.find(x=>x.name==="ai_finish_attempt").args;assert.deepEqual(settled.facts.usage,syntheticUsage);assert.equal(settled.outcome,"COMPLETED");
});

test("historical completed evaluator replay and financial denial never initiate a provider attempt",async()=>{
 const result={evaluation:{result:{care:syntheticCare},botanicalQuality:"NOT VERIFIED"}};
 const cached=await setup({claim:{decision:"REPLAY",result}});assert.deepEqual(await(await cached.handler(body)).json(),result);assert.equal(cached.calls.provider,0);
 const denied=await setup({claim:new Error("AI_EVALUATION_LIMIT")});assert.equal((await denied.handler(body)).status,429);assert.equal(denied.calls.provider,0);
});

test("historical refused/incomplete output retains reported usage, distinct telemetry and one provider attempt",async()=>{
 for(const [extra,category]of [[{status:"incomplete",output_text:'{"partial":'},"PROVIDER_INCOMPLETE"],[{output_text:undefined,output:[{type:"message",content:[{type:"refusal",refusal:"Synthetic refusal"}]}]},"PROVIDER_REFUSED"],[{status:"failed"},"PROVIDER_FAILED"]]){
  const h=await setup({response:()=>provider(extra)});assert.equal((await h.handler(body)).status,503);assert.equal(h.calls.provider,1);
  const settled=h.calls.rpcs.find(x=>x.name==="ai_finish_attempt").args;assert.equal(settled.outcome,"FAILED");assert.equal(settled.final_result,null);assert.deepEqual(settled.facts.usage,syntheticUsage);assert.equal(settled.facts.failureCategory,category);
 }
});

test("historical missing output and unknown usage are not silently promoted into a fabricated zero-cost success",async()=>{
 const empty=await setup({response:()=>provider({output_text:undefined,output:[]})});assert.equal((await empty.handler(body)).status,502);assert.equal(empty.calls.provider,1);assert.equal(empty.calls.rpcs.find(x=>x.name==="ai_finish_attempt").args.outcome,"FAILED");
 const unknown=await setup({response:()=>provider({usage:undefined})});assert.equal((await unknown.handler(body)).status,200);
 const facts=unknown.calls.rpcs.find(x=>x.name==="ai_finish_attempt").args.facts;assert.equal(facts.usage,undefined);assert.equal(facts.cost,undefined);assert.equal(facts.cost_usd,undefined);
});

test("invalid care numeric-string coercion is reproduced in Step 3 and rejected without changing valid response contracts",async()=>{
 for(const old of [true,false]){
  let settlement;
  const h=await aiEdgeHandler("plant-care-ai",{actorId:actor,sourceOverrides:old?{"supabase/functions/plant-care-ai/index.ts":execFileSync("git",["show","1682ddea7db67687d8ded7d8838b4ebff3812d7a:supabase/functions/plant-care-ai/index.ts"],{encoding:"utf8"})}:{},
   rpc:async(name,args)=>{if(name==="ai_claim_image_operation")return{decision:"RUN",operationId:actor,leaseId:home,...productionTestBinding(args.kind)};if(name==="ai_start_image_attempt")return plant;if(name==="ai_finish_attempt"){settlement=args;return{state:args.outcome==="COMPLETED"?"COMPLETED":"FAILED"};}throw Error("Unexpected RPC");},
   fetch:async()=>provider({model:"gpt-6-luna",output_text:JSON.stringify({...syntheticCare,wateringIntervalDays:"7"})})});
  assert.equal((await h({householdId:home,imageDataUrl:body.imageDataUrl,plantName:"Ficus",language:"en"})).status,old?200:502);
  assert.equal(settlement.outcome,old?"COMPLETED":"FAILED");assert.deepEqual(settlement.facts.usage,syntheticUsage);
 }
});
