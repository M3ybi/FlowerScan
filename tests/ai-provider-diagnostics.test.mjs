import assert from 'node:assert/strict';import test from 'node:test';import {build} from 'esbuild';
import {aiEdgeHandler,syntheticCare,syntheticUsage} from './fixtures/aiEdgeHarness.mjs';
import {readFileSync} from 'node:fs';
const actor='11111111-1111-4111-8111-111111111111',home='22222222-2222-4222-8222-222222222222';
const b=await build({entryPoints:['tests/fixtures/imagePayload.ts'],bundle:true,write:false,format:'esm'}),{fixtureDataUrl}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const input={householdId:home,plantName:'Private input',language:'de',imageDataUrl:fixtureDataUrl()};
test('additive diagnostics delegates an exact copy of the prior model settlement',()=>{
 const old=readFileSync('supabase/migrations/20261115174859_ai_model_routing.sql','utf8').replaceAll('\r\n','\n'),start=old.indexOf('create or replace function public.ai_finish_attempt('),end=old.indexOf('end $$;',start)+7;
 const expected=old.slice(start,end).replace('create or replace function public.ai_finish_attempt(','create function ai_private.finish_attempt_model_v1(');
 assert.ok(readFileSync('supabase/migrations/20261115195536_ai_provider_error_diagnostics.sql','utf8').replaceAll('\r\n','\n').includes(expected));
});
const setup=async(provider,settlementFailure=false)=>{const facts=[],logs=[];let calls=0;const handler=await aiEdgeHandler('plant-care-ai',{actorId:actor,logs,rpc:async(name,args)=>{
 if(name==='ai_claim_image_operation')return{decision:'RUN',operationId:actor,leaseId:home};if(name==='ai_start_image_attempt')return actor;
 if(name==='ai_finish_attempt'){facts.push(args);if(settlementFailure)throw Error('PRIVATE database error');return{state:'FAILED'};}throw Error('Unexpected RPC');
},fetch:async(_url,init)=>{calls++;assert.equal(init.headers['X-Client-Request-Id'],actor);return provider();}});return{run:()=>handler(input),facts,logs,calls:()=>calls};};
test('HTTP400 retains only allowlisted code/type/canonical parameter and no message',async()=>{
 const h=await setup(()=>Response.json({error:{code:'unsupported_value',type:'invalid_request_error',param:'reasoning.effort',message:'PRIVATE data:image/jpeg;base64,password signed-url'}},{status:400,headers:{'x-request-id':'req_safe_id'}}));assert.equal((await h.run()).status,503);
 const f=h.facts[0].facts;assert.equal(f.failureCategory,'PROVIDER_UNSUPPORTED_CONFIGURATION');assert.equal(f.requestId,'req_safe_id');assert.equal(f.providerDiagnostics.param,'reasoning.effort');assert.equal(f.providerDiagnostics.usageState,'MISSING');assert.match(f.providerDiagnostics.responseAt,/^\d{4}-/);assert.equal(f.usage,undefined);assert.equal(h.calls(),1);
 assert.ok(!JSON.stringify([h.facts,h.logs]).includes('PRIVATE'));assert.ok(!JSON.stringify(h.logs).includes('data:image'));
});
test('malicious diagnostic fields, financial identifiers and token values are not echoed',async()=>{
 const privateValue='PRIVATE https://signed.invalid?token=x';const h=await setup(()=>Response.json({model:privateValue,id:privateValue,service_tier:{toString:privateValue},status:privateValue,reasoning:{effort:privateValue},usage:{input_tokens:privateValue},error:{code:privateValue,type:{message:privateValue},param:'input[0].content[1].text',message:privateValue,secret:privateValue}},{status:400,headers:{'x-request-id':'unsafe secret value'}}));await h.run();const f=h.facts[0].facts;
 assert.equal(f.requestId,null);assert.equal(f.model,null);assert.equal(f.responseId,null);assert.equal(f.providerDiagnostics.code,'OTHER');assert.equal(f.providerDiagnostics.type,'OTHER');assert.equal(f.providerDiagnostics.param,'input[].content[].text');assert.equal(f.usage.input_tokens,undefined);assert.ok(!JSON.stringify([h.facts,h.logs]).includes('PRIVATE'));
});
test('missing details and request IDs use generic bounded identifiers',async()=>{
 for(const error of [undefined,null,[],{},'PRIVATE']){const h=await setup(()=>Response.json({error},{status:400}));await h.run();assert.equal(h.facts[0].facts.failureCategory,'PROVIDER_INVALID_REQUEST');assert.equal(h.facts[0].facts.requestId,null);assert.equal(h.facts[0].facts.providerDiagnostics.code,null);}
});
test('HTTP authentication, permission, rate and server failures have distinct fixed categories',async()=>{
 for(const[status,category]of [[401,'PROVIDER_AUTHENTICATION'],[403,'PROVIDER_PERMISSION'],[429,'PROVIDER_RATE_LIMIT'],[500,'PROVIDER_INTERNAL'],[503,'PROVIDER_INTERNAL']]){const h=await setup(()=>Response.json({error:{type:'server_error',message:'PRIVATE'}},{status}));assert.equal((await h.run()).status,503);assert.equal(h.facts[0].facts.failureCategory,category);assert.equal(h.calls(),1);assert.ok(!JSON.stringify(h.logs).includes('PRIVATE'));}
});
test('oversized/non-JSON/array errors remain bounded, retain HTTP class and hold missing usage',async()=>{
 for(const[body,parse]of [['x'.repeat(131073),'OVERSIZED'],['not JSON','MALFORMED'],['[]','MALFORMED']]){const h=await setup(()=>new Response(body,{status:400}));await h.run();const f=h.facts[0].facts;assert.equal(h.facts[0].outcome,'UNKNOWN');assert.equal(f.httpStatus,400);assert.equal(f.providerDiagnostics.parseStatus,parse);assert.equal(f.providerDiagnostics.category,'PROVIDER_INVALID_REQUEST');assert.equal(f.usage,undefined);assert.equal(f.costUsd,undefined);assert.equal(h.calls(),1);}
});
test('an unsuccessful response with valid usage still settles those exact financial facts',async()=>{
 const h=await setup(()=>Response.json({model:'gpt-4o-2024-08-06',service_tier:'default',usage:syntheticUsage,error:{code:'invalid_image',message:'PRIVATE'}},{status:400}));assert.equal((await h.run()).status,400);assert.deepEqual(h.facts[0].facts.usage,syntheticUsage);assert.equal(h.facts[0].facts.providerDiagnostics.usageState,'REPORTED');assert.equal(h.facts[0].outcome,'FAILED');
});
test('settlement failure repeats accounting with identical diagnostics, never inference',async()=>{
 const h=await setup(()=>Response.json({error:{code:'invalid_value',type:'invalid_request_error',param:'service_tier',message:'PRIVATE'}},{status:400}),true);assert.equal((await h.run()).status,503);assert.equal(h.calls(),1);assert.equal(h.facts.length,2);assert.deepEqual(h.facts[0],h.facts[1]);assert.equal(h.logs.length,1);assert.ok(!JSON.stringify(h.logs).includes('PRIVATE'));
});
test('transport, timeout and malformed successful bodies have distinct diagnostics without invented usage',async()=>{
 for(const[provider,category,status]of [[()=>{throw new TypeError('PRIVATE');},'PROVIDER_TRANSPORT',502],[()=>{throw new DOMException('PRIVATE','TimeoutError');},'PROVIDER_TIMEOUT',504],[()=>new Response('PRIVATE'),'PROVIDER_RESULT_INVALID',502]]){const h=await setup(provider);assert.equal((await h.run()).status,status);assert.equal(h.facts[0].facts.providerDiagnostics.category,category);assert.equal(h.facts[0].facts.usage,undefined);assert.ok(!JSON.stringify(h.logs).includes('PRIVATE'));}
});
test('valid output with missing usage is explicitly observable, not charged zero',async()=>{
 const h=await setup(()=>Response.json({status:'completed',output_text:JSON.stringify(syntheticCare)}));await h.run();assert.equal(h.facts[0].facts.providerDiagnostics.category,'PROVIDER_MISSING_USAGE');assert.equal(h.facts[0].facts.costUsd,undefined);assert.equal(h.facts[0].facts.usage,undefined);
});
