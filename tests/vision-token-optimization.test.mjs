import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { estimateGpt4oImageTokens as estimate, resizeDimensions, visionVariants } from "../scripts/lib/visionBenchmark.mjs";
import { aiEdgeHandler, syntheticCare, syntheticUsage, historicalTestBinding, productionTestBinding } from "./fixtures/aiEdgeHarness.mjs";
const actor = "11111111-1111-4111-8111-111111111111", run = "22222222-2222-4222-8222-222222222222";
const bundled = await build({ entryPoints:["tests/fixtures/imagePayload.ts"],bundle:true,write:false,format:"esm" });
const { fixtureDataUrl } = await import("data:text/javascript;base64,"+Buffer.from(bundled.outputFiles[0].text).toString("base64"));
const imageDataUrl = fixtureDataUrl();
const body = { householdId:run,plantName:"Synthetic",imageDataUrl,language:"en" };
const baseline = "f5380f1e8bbd338d3c893a9ce58918ea432c8eeb";
const previous = path => execFileSync("git",["show",`${baseline}:${path}`],{encoding:"utf8"});
const safe = { containsPlant:true,plantConfidence:1,hasSensitiveBackground:false,hasExplicitOrUnsafeContent:false,
  hasRestrictedFootageOrPrivateContent:false,shouldAllowUpload:true,failureReasons:[],safeUserMessage:"Allowed" };
const archived = name => Object.fromEntries([`supabase/functions/${name}/index.ts`,"supabase/functions/_shared/aiOperation.ts"].map(path=>[path,execFileSync("git",["show",`18aa79931f210f63a249988c8c7cc9ecadea8470:${path}`],{encoding:"utf8"})]));
const provider = (value, model="gpt-6-luna") => Response.json({model,service_tier:"default",status:"completed",usage:syntheticUsage,output_text:JSON.stringify(value)});

test("documented GPT-4o tile estimates preserve thresholds and never become billing measurements", () => {
  for(const [w,h,tokens] of [[1125,1600,1105],[900,1280,1105],[720,1024,765],[540,768,765],[1600,1600,765],[512,512,255],[550,1600,1445],[440,1280,595],[1,1600,765]]){
    assert.equal(estimate(w,h,"high").estimatedImageTokens,tokens);
    assert.equal(estimate(h,w,"high").estimatedImageTokens,tokens);
    assert.equal(estimate(w,h,"low").estimatedImageTokens,85);
  }
  for(const args of [[0,1,"high"],[1,-1,"low"],[NaN,2,"high"],[1,2,"auto"],[1.5,2,"high"]])assert.throws(()=>estimate(...args));
  assert.deepEqual(resizeDimensions(40,20,1600),{width:40,height:20});
  assert.deepEqual(resizeDimensions(1125,1600,1024),{width:720,height:1024});
  assert.equal(visionVariants.length,6);
});

test("Luna keeps Step 2 logical fingerprint and v1 botanical payload while changing only provider configuration", async () => {
  const calls=[];
  const invoke = async sourceOverrides => {
    let payload,claim;
    const handler=await aiEdgeHandler("plant-care-ai",{actorId:actor,sourceOverrides,
      rpc:async(name,args)=>{if(["ai_claim_operation","ai_claim_image_operation"].includes(name)){claim=args;return{decision:"RUN",operationId:actor,leaseId:actor,...(Object.keys(sourceOverrides).length?historicalTestBinding(args.kind):productionTestBinding(args.kind))};}
        if(["ai_start_attempt","ai_start_image_attempt"].includes(name))return run;if(name==="ai_finish_attempt")return{state:"COMPLETED"};throw new Error("Unexpected RPC");},
      fetch:async(_url,init)=>{payload=JSON.parse(init.body);return provider(syntheticCare,payload.model);},
    });
    assert.equal((await handler({...body,model:"client-forged",detail:"low",imageDetail:"low"})).status,200);calls.push({payload,claim});
  };
  await invoke({"supabase/functions/_shared/aiOperation.ts":previous("supabase/functions/_shared/aiOperation.ts")});
  await invoke({});
  const strip=({model,reasoning,prompt_cache_options,...payload})=>payload;assert.deepEqual(strip(calls[1].payload),strip(calls[0].payload));assert.deepEqual(calls[1].payload.reasoning,{effort:"none"});assert.deepEqual(calls[1].payload.prompt_cache_options,{ttl:"30m"});assert.equal(calls[0].payload.model,"gpt-4o");assert.equal(calls[1].claim.request_fingerprint,calls[0].claim.request_fingerprint);
  assert.equal(calls[1].claim.image_detail,"high");assert.equal(calls[1].claim.preprocessing_profile,"normalized-jpeg-v1");
  assert.equal(calls[1].claim.encoded_image_bytes,Buffer.from(imageDataUrl.split(",")[1],"base64").length);
  assert.equal(calls[1].payload.model,"gpt-6-luna");assert.equal(calls[1].payload.input[0].content.at(-1).detail,"high");
  assert.equal(calls[1].claim.image_sha256,createHash("sha256").update(Buffer.from(imageDataUrl.split(",")[1],"base64")).digest("hex"));
});

test("cached safety data is checked against today's rules before acceptance", async () => {
  const invoke=async(sourceOverrides,validation)=>{
    let calls=0;const h=await aiEdgeHandler("validate-plant-image",{actorId:actor,sourceOverrides,
      rpc:async name=>{if(name==='ai_resolve_safety_configuration'){const b=productionTestBinding('image_validation');return{id:b.effectiveConfiguration,hash:b.configurationHash};}assert.equal(name,"ai_claim_image_operation");return{decision:"REPLAY",result:{validation}};},
      fetch:async()=>{calls++;throw new Error("No inference on replay");}});
    const result=await h({imageDataUrl,language:"en"});assert.equal(calls,0);return result.status;
  };
  const olderDecision={...safe,plantConfidence:0.74};
  assert.equal(await invoke({"supabase/functions/_shared/plantImageValidation.ts":previous("supabase/functions/_shared/plantImageValidation.ts")},olderDecision),200);
  for(const value of [olderDecision,{...safe,hasSensitiveBackground:true},{...safe,hasRestrictedFootageOrPrivateContent:true},{...safe,failureReasons:["policy-rejected"]},{},null])assert.equal(await invoke({},value),422);
  assert.equal(await invoke({},safe),200);
});

test("new Luna safety policy changes its identity while preserving schema, JPEG and output ceiling", async () => {
  const calls=[];
  for(const old of [true,false]){
    let claim,payload;const sourceOverrides=old?{"supabase/functions/validate-plant-image/index.ts":previous("supabase/functions/validate-plant-image/index.ts"),"supabase/functions/_shared/plantImageValidation.ts":previous("supabase/functions/_shared/plantImageValidation.ts"),"supabase/functions/_shared/aiOperation.ts":previous("supabase/functions/_shared/aiOperation.ts")}:{};
    const h=await aiEdgeHandler("validate-plant-image",{actorId:actor,sourceOverrides,
      rpc:async(name,args)=>{const binding=old?historicalTestBinding('image_validation'):productionTestBinding('image_validation');if(name==='ai_resolve_safety_configuration')return{id:binding.effectiveConfiguration,hash:binding.configurationHash};if(name==='ai_claim_operation'||name==='ai_claim_image_operation'){claim=args;return{decision:'RUN',operationId:actor,leaseId:actor,...binding};}return name==='ai_start_attempt'||name==='ai_start_image_attempt'?run:{state:'COMPLETED'};},
      fetch:async(_url,init)=>{payload=JSON.parse(init.body);return provider(safe,payload.model);}});
    assert.equal((await h({imageDataUrl,language:"sk"})).status,200);calls.push({payload,claim});
  }
  assert.equal(calls[0].payload.model,'gpt-4o');assert.equal(calls[1].payload.model,'gpt-6-luna');assert.equal(calls[1].payload.instructions,calls[0].payload.instructions);
  assert.deepEqual(calls[1].payload.text,calls[0].payload.text);assert.equal(calls[1].payload.max_output_tokens,700);
  const content=i=>calls[i].payload.input[0].content;assert.deepEqual(content(1).find(c=>c.type==='input_image'),content(0).find(c=>c.type==='input_image'));
  assert.notEqual(content(1).find(c=>c.type==='input_text').text,content(0).find(c=>c.type==='input_text').text);assert.match(content(1).find(c=>c.type==='input_text').text,/small|corners/);
  assert.notEqual(calls[1].claim.request_fingerprint,calls[0].claim.request_fingerprint);assert.equal(calls[1].claim.image_sha256,calls[0].claim.image_sha256);assert.equal(calls[1].claim.prompt_schema_version,'plant-image-safety-luna-none-v2');
});

test("historical benchmark access and client model/detail overrides cannot initiate provider work", async () => {
  for(const [signedIn,args,expected] of [[false,{runId:run,inputKey:"sample",imageDataUrl},401],[true,{runId:run,inputKey:"sample",imageDataUrl},403],
    [true,{runId:run,inputKey:"sample",imageDataUrl,detail:"low"},400],[true,{runId:run,inputKey:"sample",imageDataUrl,model:"other"},400]]){
    let calls=0;const h=await aiEdgeHandler("vision-token-benchmark",{actorId:actor,sourceOverrides:archived("vision-token-benchmark"),signedIn,rpc:async()=>{throw new Error("AI_EVALUATION_FORBIDDEN");},fetch:async()=>{calls++;throw new Error("Unexpected inference");}});
    assert.equal((await h(args)).status,expected);assert.equal(calls,0);
  }
});

test("historical server-selected low-detail probe is metered and never returns safety evidence", async () => {
  let payload,claim,settled;
  const h=await aiEdgeHandler("vision-token-benchmark",{actorId:actor,sourceOverrides:archived("vision-token-benchmark"),
    rpc:async(name,args)=>{
      if(name==="ai_resolve_vision_input")return{detail:"low",preprocessingProfile:"vision-benchmark-v1:d_512_low",inputKey:"sample",purpose:"probe"};
      if(name==="ai_claim_image_operation"){claim=args;return{decision:"RUN",operationId:actor,leaseId:actor};}
      if(name==="ai_start_image_attempt")return run;
      if(name==="ai_finish_attempt"){settled=args;return{state:"COMPLETED"};}
      throw new Error("Unexpected RPC");
    },fetch:async(_url,init)=>{payload=JSON.parse(init.body);return provider({containsPlant:true},"gpt-4o");}});
  const response=await h({runId:run,inputKey:"sample",imageDataUrl,validated:true,imageHash:"forged"});assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{probe:{containsPlant:true}});
  assert.equal(payload.input[0].content[1].detail,"low");assert.equal(payload.model,"gpt-4o");
  assert.equal(claim.image_detail,"low");assert.equal(claim.evaluation_input_key,"sample");assert.equal(claim.prompt_schema_version,"vision-token-probe-v1");
  assert.deepEqual(settled.facts.usage,syntheticUsage);assert.equal(settled.outcome,"COMPLETED");
});

test("historical exhausted evaluation budget fails before inference", async () => {
  let calls=0;
  const h=await aiEdgeHandler("vision-token-benchmark",{actorId:actor,sourceOverrides:archived("vision-token-benchmark"),rpc:async name=>{
    if(name==="ai_resolve_vision_input")return{detail:"high",preprocessingProfile:"vision-benchmark-v1:baseline_1600_high",inputKey:"sample",purpose:"probe"};
    throw new Error("AI_EVALUATION_LIMIT");},fetch:async()=>{calls++;throw new Error("Unexpected provider call");}});
  assert.equal((await h({runId:run,inputKey:"sample",imageDataUrl})).status,429);assert.equal(calls,0);
});
