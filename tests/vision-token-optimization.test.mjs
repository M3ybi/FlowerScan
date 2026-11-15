import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { estimateGpt4oImageTokens as estimate, resizeDimensions, visionVariants } from "../scripts/lib/visionBenchmark.mjs";
import { aiEdgeHandler, syntheticCare, syntheticUsage } from "./fixtures/aiEdgeHarness.mjs";
const actor = "11111111-1111-4111-8111-111111111111", run = "22222222-2222-4222-8222-222222222222";
const bundled = await build({ entryPoints:["tests/fixtures/imagePayload.ts"],bundle:true,write:false,format:"esm" });
const { fixtureDataUrl } = await import("data:text/javascript;base64,"+Buffer.from(bundled.outputFiles[0].text).toString("base64"));
const imageDataUrl = fixtureDataUrl();
const body = { householdId:run,plantName:"Synthetic",imageDataUrl,language:"en" };
const baseline = "f5380f1e8bbd338d3c893a9ce58918ea432c8eeb";
const previous = path => execFileSync("git",["show",`${baseline}:${path}`],{encoding:"utf8"});
const safe = { containsPlant:true,plantConfidence:1,hasSensitiveBackground:false,hasExplicitOrUnsafeContent:false,
  hasRestrictedFootageOrPrivateContent:false,shouldAllowUpload:true,failureReasons:[],safeUserMessage:"Allowed" };
const provider = value => Response.json({model:"gpt-4o-2024-08-06",service_tier:"default",status:"completed",usage:syntheticUsage,output_text:JSON.stringify(value)});

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

test("default provider payload and fingerprint match the immutable Step 2 release", async () => {
  const calls=[];
  const invoke = async sourceOverrides => {
    let payload,claim;
    const handler=await aiEdgeHandler("plant-care-ai",{actorId:actor,sourceOverrides,
      rpc:async(name,args)=>{if(["ai_claim_operation","ai_claim_image_operation"].includes(name)){claim=args;return{decision:"RUN",operationId:actor,leaseId:actor};}
        if(["ai_start_attempt","ai_start_image_attempt"].includes(name))return run;if(name==="ai_finish_attempt")return{state:"COMPLETED"};throw new Error("Unexpected RPC");},
      fetch:async(_url,init)=>{payload=JSON.parse(init.body);return provider(syntheticCare);},
    });
    assert.equal((await handler({...body,model:"client-forged",detail:"low",imageDetail:"low"})).status,200);calls.push({payload,claim});
  };
  await invoke({"supabase/functions/_shared/aiOperation.ts":previous("supabase/functions/_shared/aiOperation.ts")});
  await invoke({});
  assert.deepEqual(calls[1].payload,calls[0].payload);assert.equal(calls[1].claim.request_fingerprint,calls[0].claim.request_fingerprint);
  assert.equal(calls[1].claim.image_detail,"high");assert.equal(calls[1].claim.preprocessing_profile,"normalized-jpeg-v1");
  assert.equal(calls[1].claim.encoded_image_bytes,Buffer.from(imageDataUrl.split(",")[1],"base64").length);
  assert.equal(calls[1].payload.model,"gpt-4o");assert.equal(calls[1].payload.input[0].content.at(-1).detail,"high");
  assert.equal(calls[1].claim.image_sha256,createHash("sha256").update(Buffer.from(imageDataUrl.split(",")[1],"base64")).digest("hex"));
});

test("cached safety data is checked against today's rules before acceptance", async () => {
  const invoke=async(sourceOverrides,validation)=>{
    let calls=0;const h=await aiEdgeHandler("validate-plant-image",{actorId:actor,sourceOverrides,
      rpc:async name=>{assert.equal(name,"ai_claim_image_operation");return{decision:"REPLAY",result:{validation}};},
      fetch:async()=>{calls++;throw new Error("No inference on replay");}});
    const result=await h({imageDataUrl,language:"en"});assert.equal(calls,0);return result.status;
  };
  const olderDecision={...safe,plantConfidence:0.74};
  assert.equal(await invoke({"supabase/functions/_shared/plantImageValidation.ts":previous("supabase/functions/_shared/plantImageValidation.ts")},olderDecision),200);
  for(const value of [olderDecision,{...safe,hasSensitiveBackground:true},{...safe,hasRestrictedFootageOrPrivateContent:true},{...safe,failureReasons:["policy-rejected"]},{},null])assert.equal(await invoke({},value),422);
  assert.equal(await invoke({},safe),200);
});

test("moved safety prompt/schema leave ordinary provider input byte-equivalent", async () => {
  const payloads=[];
  for(const sourceOverrides of [{"supabase/functions/_shared/plantImageValidation.ts":previous("supabase/functions/_shared/plantImageValidation.ts")},{}]){
    const h=await aiEdgeHandler("validate-plant-image",{actorId:actor,sourceOverrides,
      rpc:async name=>name==="ai_claim_image_operation"?{decision:"RUN",operationId:actor,leaseId:actor}:name==="ai_start_image_attempt"?run:{state:"COMPLETED"},
      fetch:async(_url,init)=>{payloads.push(init.body);return provider(safe);}});
    assert.equal((await h({imageDataUrl,language:"sk"})).status,200);
  }
  assert.equal(payloads[1],payloads[0]);
});

test("benchmark access and client model/detail overrides cannot initiate provider work", async () => {
  for(const [signedIn,args,expected] of [[false,{runId:run,inputKey:"sample",imageDataUrl},401],[true,{runId:run,inputKey:"sample",imageDataUrl},403],
    [true,{runId:run,inputKey:"sample",imageDataUrl,detail:"low"},400],[true,{runId:run,inputKey:"sample",imageDataUrl,model:"other"},400]]){
    let calls=0;const h=await aiEdgeHandler("vision-token-benchmark",{actorId:actor,signedIn,rpc:async()=>{throw new Error("AI_EVALUATION_FORBIDDEN");},fetch:async()=>{calls++;throw new Error("Unexpected inference");}});
    assert.equal((await h(args)).status,expected);assert.equal(calls,0);
  }
});

test("server-selected low-detail probe is metered and never returns safety evidence", async () => {
  let payload,claim,settled;
  const h=await aiEdgeHandler("vision-token-benchmark",{actorId:actor,
    rpc:async(name,args)=>{
      if(name==="ai_resolve_vision_input")return{detail:"low",preprocessingProfile:"vision-benchmark-v1:d_512_low",inputKey:"sample",purpose:"probe"};
      if(name==="ai_claim_image_operation"){claim=args;return{decision:"RUN",operationId:actor,leaseId:actor};}
      if(name==="ai_start_image_attempt")return run;
      if(name==="ai_finish_attempt"){settled=args;return{state:"COMPLETED"};}
      throw new Error("Unexpected RPC");
    },fetch:async(_url,init)=>{payload=JSON.parse(init.body);return provider({containsPlant:true});}});
  const response=await h({runId:run,inputKey:"sample",imageDataUrl,validated:true,imageHash:"forged"});assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{probe:{containsPlant:true}});
  assert.equal(payload.input[0].content[1].detail,"low");assert.equal(payload.model,"gpt-4o");
  assert.equal(claim.image_detail,"low");assert.equal(claim.evaluation_input_key,"sample");assert.equal(claim.prompt_schema_version,"vision-token-probe-v1");
  assert.deepEqual(settled.facts.usage,syntheticUsage);assert.equal(settled.outcome,"COMPLETED");
});

test("an exhausted evaluation budget fails before inference", async () => {
  let calls=0;
  const h=await aiEdgeHandler("vision-token-benchmark",{actorId:actor,rpc:async name=>{
    if(name==="ai_resolve_vision_input")return{detail:"high",preprocessingProfile:"vision-benchmark-v1:baseline_1600_high",inputKey:"sample",purpose:"probe"};
    throw new Error("AI_EVALUATION_LIMIT");},fetch:async()=>{calls++;throw new Error("Unexpected provider call");}});
  assert.equal((await h({runId:run,inputKey:"sample",imageDataUrl})).status,429);assert.equal(calls,0);
});
