import assert from 'node:assert/strict';import test from 'node:test';import{readFile}from'node:fs/promises';import{build}from'esbuild';
import{aiEdgeHandler,syntheticCare,syntheticUsage}from'./fixtures/aiEdgeHarness.mjs';
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:'export * from "./supabase/functions/_shared/aiModelRegistry.ts";export * from "./supabase/functions/_shared/botanicalPromptCandidates.ts";export * from "./tests/fixtures/imagePayload.ts";'},bundle:true,write:false,format:'esm'});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const actor='11111111-1111-4111-8111-111111111111',home='22222222-2222-4222-8222-222222222222',run='33333333-3333-4333-8333-333333333333';
const validation={containsPlant:true,plantConfidence:.95,hasSensitiveBackground:false,hasExplicitOrUnsafeContent:false,hasRestrictedFootageOrPrivateContent:false,shouldAllowUpload:true,failureReasons:[],safeUserMessage:'Valid plant.'};
test('all eight production configurations are immutable Luna none/low and exact manifest hashes',async()=>{
 const actual=await Promise.all(api.lunaProductionConfigurations.map(async definition=>({id:definition.id,hash:await api.modelConfigurationHash(definition),definition})));
 assert.deepEqual(actual,JSON.parse(await readFile('tests/fixtures/ai-luna-manifest.json','utf8')));assert.equal(actual.length,8);
 for(const config of api.lunaProductionConfigurations){assert.ok(Object.isFrozen(config));assert.equal(config.model,'gpt-6-luna');assert.ok(['none','low'].includes(config.reasoning));assert.equal(config.maxAttempts,1);assert.equal(config.detail,'high');}
 for(const route of ['initial_care','care_refresh','diagnosis','image_safety'])assert.equal(api.getLunaConfiguration(route).reasoning,'none');
});
test('safety evaluation uses the existing metered adapter, full strict verdict and no upload capability',async()=>{
 for(const config of api.lunaSafetyConfigurations){const context={plantName:'',symptomNotes:'',language:'en'},hash=await api.modelConfigurationHash(config),calls=[],requests=[];
  const invoke=await aiEdgeHandler('model-evaluation',{actorId:actor,rpc:async(name,args)=>{calls.push({name,args});
   if(name==='ai_resolve_model_input')return{configurationId:config.id,configurationHash:hash,contextHash:await api.botanicalContextHash(context),language:'en',householdId:home,plantId:run};
   if(name==='ai_claim_model_operation')return{decision:'RUN',operationId:actor,leaseId:home,effectiveConfiguration:config.id,configurationHash:hash};
   if(name==='ai_start_image_attempt')return run;if(name==='ai_finish_attempt')return{state:'COMPLETED'};throw Error('Unexpected RPC');},
   fetch:async(_url,init)=>{const payload=JSON.parse(init.body);requests.push(payload);return Response.json({model:config.model,service_tier:'default',status:'completed',reasoning:{effort:config.reasoning},usage:syntheticUsage,output_text:JSON.stringify(validation)});}});
  const response=await invoke({runId:run,inputKey:'safe',imageDataUrl:api.fixtureDataUrl(),...context});assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.evaluation.result.decision,'ALLOW');assert.deepEqual(result.evaluation.result.validation,validation);assert.equal(result.receipt,undefined);
  assert.equal(calls.find(c=>c.name==='ai_claim_model_operation').args.kind,'image_validation');assert.equal(requests.length,1);assert.equal(requests[0].model,'gpt-6-luna');
  assert.deepEqual(requests[0].reasoning,{effort:config.reasoning});assert.equal(requests[0].max_output_tokens,700);assert.equal(requests[0].text.format.strict,true);
 }
});
test('both safety efforts enforce the selected app language in the actual payload',()=>{
 for(const config of api.lunaSafetyConfigurations)for(const language of ['en','sk','de','fr','es']){
  const payload=api.buildModelEvaluationPayload(config,{plantName:'',symptomNotes:'',language},api.fixtureDataUrl());
  assert.ok(payload.instructions.includes(`(${language})`));assert.equal(payload.input[0].content[1].detail,'high');
 }
});
test('missing/wrong provider model or effort fails closed, settles facts and never attempts a fallback',async()=>{
 const config=api.getLunaConfiguration('initial_care'),hash=await api.modelConfigurationHash(config);
 for(const provider of [{model:'gpt-6.1-terra'},{model:'gpt-4o'},{model:'gpt-6-luna-unregistered'},{},{model:'gpt-6-luna',reasoning:{effort:'low'}}]){let calls=0;const settlements=[];
  const invoke=await aiEdgeHandler('plant-care-ai',{actorId:actor,rpc:async(name,args)=>{
   if(name==='ai_claim_image_operation')return{decision:'RUN',operationId:actor,leaseId:home,effectiveConfiguration:config.id,configurationHash:hash};
   if(name==='ai_start_image_attempt')return run;if(name==='ai_finish_attempt'){settlements.push(args);return{state:args.outcome};}throw Error('Unexpected RPC');},
   fetch:async()=>{calls++;return Response.json({...provider,service_tier:'default',status:'completed',usage:syntheticUsage,output_text:JSON.stringify(syntheticCare)});}});
  assert.equal((await invoke({householdId:home,plantName:'Synthetic',imageDataUrl:api.fixtureDataUrl(),language:'en'})).status,503);assert.equal(calls,1);assert.equal(settlements.length,1);assert.equal(settlements[0].outcome,'FAILED');assert.deepEqual(settlements[0].facts.usage,syntheticUsage);
 }
});
test('ordinary authenticated household roles receive no global owner data or actions',async()=>{
 for(const signedIn of [false,true]){const calls=[];const invoke=await aiEdgeHandler('ai-owner-control',{actorId:actor,signedIn,rpc:async(name,args)=>{calls.push({name,args});assert.equal(name,'ai_owner_access');return false;},fetch:()=>{throw Error('No provider');}});
  for(const action of ['state','finops','approveCampaign','acceptRisk','applyStage','recover','revoke','commitCutover'])assert.equal((await invoke({action,actor:home})).status,signedIn?403:401);
  if(!signedIn)assert.equal(calls.length,0);
 }
});
test('owner RPCs bind the actual Auth subject and never forward forged actor, SQL or passing evidence',async()=>{
 const calls=[];const invoke=await aiEdgeHandler('ai-owner-control',{actorId:actor,rpc:async(name,args)=>{calls.push({name,args});return name==='ai_owner_access'?true:{recorded:true};},fetch:()=>{throw Error('No provider');}});
 assert.equal((await invoke({action:'approveCampaign',proposalSha256:'a'.repeat(64),actor:home,sql:'forged',engineeringChecksPassed:true})).status,200);
 assert.deepEqual(calls.at(-1),{name:'ai_owner_approve_campaign',args:{actor,proposal_sha256:'a'.repeat(64)}});
 assert.equal((await invoke({action:'acceptRisk',evidenceSha256:'b'.repeat(64),configurationIds:['forged'],recoveryConfigurationIds:[],approvedStages:[100],rollbackConditions:'Stop'})).status,400);
});
