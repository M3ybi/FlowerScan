import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';import {build} from 'esbuild';
import {createAiTestDatabase,aiRpc} from './lib/aiTestDatabase.mjs';import {aiEdgeHandler,syntheticFacts} from '../tests/fixtures/aiEdgeHarness.mjs';
const db=await createAiTestDatabase();let checks=0;const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
try{
 const actor=randomUUID(),house=randomUUID(),plant=randomUUID(),owner=db.owner;
 await owner.query('insert into auth.users(id,email) values($1,$2)',[actor,'synthetic-diagnostics@example.invalid']);
 await owner.query("insert into public.households(id,name,created_by,premium_enabled,plan_key) values($1,'Synthetic diagnostics',$2,true,'premium')",[house,actor]);
 await owner.query("insert into public.household_members(household_id,user_id,role,status) values($1,$2,'owner','active')",[house,actor]);await owner.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
 await owner.query("insert into public.plants(id,household_id,source,display_name,likely_name,identification,identification_note,short_care,light,watering,soil,created_by) values($1,$2,'custom','Synthetic','Synthetic','likely','','','','','',$3)",[plant,house,actor]);
 const b=await build({entryPoints:['tests/fixtures/imagePayload.ts'],bundle:true,write:false,format:'esm'}),{fixtureDataUrl}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
 let providerCalls=0;const clients=await Promise.all(Array.from({length:100},()=>db.connect()));
 for(const c of clients)await c.query("select set_config('request.jwt.claim.role','service_role',false)");
 const handlers=await Promise.all(clients.map(c=>aiEdgeHandler('plant-care-ai',{actorId:actor,rpc:(name,args)=>aiRpc(c,name,args),fetch:async()=>{providerCalls++;return Response.json({error:{code:'invalid_value',type:'invalid_request_error',param:'service_tier',message:'PRIVATE user image and notes'}},{status:400,headers:{'x-request-id':'req_safe_diagnostic'}});}})));
 const responses=await Promise.all(handlers.map(h=>h({householdId:house,plantId:plant,plantName:'Synthetic',language:'de',generationSource:'manual_refresh',imageDataUrl:fixtureDataUrl()})));
 equal(providerCalls,1);equal(responses.every(r=>[409,503].includes(r.status)),true);
 const a=(await owner.query('select * from ai_private.attempts')).rows[0],op=(await owner.query('select * from ai_private.operations where id=$1',[a.operation_id])).rows[0];
 equal(a.accounting_status,'UNKNOWN_USAGE');equal(a.cost_usd,null);equal(a.exposure_usd,'0.334000000000');equal(a.provider_diagnostics.code,'invalid_value');equal(a.provider_diagnostics.param,'service_tier');equal(JSON.stringify(a).includes('PRIVATE'),false);
 const changed={...syntheticFacts(),usage:undefined,failureCategory:'PROVIDER_INVALID_REQUEST',providerDiagnostics:{...a.provider_diagnostics,code:'unsupported_parameter',message:'PRIVATE'}};
 await Promise.all(clients.map(c=>aiRpc(c,'ai_finish_attempt',{operation:op.id,lease:op.lease_id,attempt:a.id,outcome:'FAILED',final_result:null,facts:changed})));
 equal((await owner.query('select provider_diagnostics from ai_private.attempts where id=$1',[a.id])).rows[0].provider_diagnostics,a.provider_diagnostics);
 const reconciled=await aiRpc(owner,'ai_reconcile_attempt',{attempt:a.id,verified_facts:syntheticFacts()});equal(reconciled.accountingStatus,'MEASURED');
 const after=(await owner.query('select cost_usd::text,provider_diagnostics from ai_private.attempts where id=$1',[a.id])).rows[0];equal(after.cost_usd,'0.003250000000');equal(after.provider_diagnostics,a.provider_diagnostics);
 await assert.rejects(owner.query("update ai_private.attempts set provider_diagnostics=provider_diagnostics||'{\"message\":\"PRIVATE\"}' where id=$1",[a.id]),/check constraint/);checks++;
 for(const role of ['anon','authenticated','service_role']){const privileges=(await owner.query("select has_function_privilege($1,'ai_private.safe_provider_diagnostics(jsonb)','execute') sanitizes,has_function_privilege($1,'ai_private.finish_attempt_model_v1(uuid,uuid,uuid,text,jsonb,jsonb)','execute') settles",[role])).rows[0];equal(privileges,{sanitizes:false,settles:false});}
 console.log(JSON.stringify({status:'PASS',sessions:100,assertions:checks,checks:['100 actual Edge callers:one provider error/attempt','100 concurrent duplicate settlements:immutable first diagnostics','unknown exposure preserved;verified usage reconciliation exact','malicious metadata rejected;private helpers not client callable'],productionDataModified:false}));
}finally{await db.close();}
