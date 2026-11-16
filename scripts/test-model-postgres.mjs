import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {createAiTestDatabase,aiRpc} from './lib/aiTestDatabase.mjs';
import {aiEdgeHandler,syntheticCare,syntheticFacts,syntheticUsage} from '../tests/fixtures/aiEdgeHarness.mjs';
const db=await createAiTestDatabase(),{owner}=db;let assertions=0;
const equal=(a,b,message)=>{assert.deepEqual(a,b,message);assertions++;};
const rejects=async(p,pattern)=>{await assert.rejects(p,pattern);assertions++;};
const sha=s=>createHash('sha256').update(s).digest('hex');
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:'export * from "./supabase/functions/_shared/aiModelRegistry.ts";export * from "./supabase/functions/_shared/botanicalPromptCandidates.ts";export * from "./tests/fixtures/imagePayload.ts";'},bundle:true,write:false,format:'esm'});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
try{
 const actors=Array.from({length:5},()=>randomUUID()),stranger=randomUUID(),plant=randomUUID();
 const home=(await owner.query("select id from (select ('60000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid id from generate_series(1,1000) g) s where ai_private.model_cohort(id,'care_refresh')<500 limit 1")).rows[0].id;
 for(const id of [...actors,stranger])await owner.query('insert into auth.users(id,email) values($1,$2)',[id,`synthetic-${id}@example.invalid`]);
 await owner.query("insert into public.households(id,name,created_by,premium_enabled,plan_key) values($1,'Synthetic model evaluation',$2,true,'premium')",[home,actors[0]]);
 for(const [i,id]of actors.entries())await owner.query("insert into public.household_members(household_id,user_id,role,status) values($1,$2,$3,'active')",[home,id,i?'viewer':'owner']);
 await owner.query("select set_config('request.jwt.claim.sub',$1,false)",[actors[0]]);
 await owner.query("insert into public.plants(id,household_id,source,display_name,likely_name,identification,identification_note,short_care,light,watering,soil,created_by) values($1,$2,'custom','Synthetic','Synthetic','likely','','','','','',$3)",[plant,home,actors[0]]);
 await owner.query('update ai_private.control set account_per_minute=100 where singleton');
 const imageDataUrl=api.fixtureDataUrl(),image=Buffer.from(imageDataUrl.split(',')[1],'base64');
 const base={actor:actors[0],household:home,plant,kind:'care_refresh',retry_key:'ordinary',request_fingerprint:sha('ordinary'),image_sha256:sha(image),model_name:'gpt-4o',prompt_schema_version:'plant-care-v1',output_limit:1400,image_width:2,image_height:3,image_detail:'high',preprocessing_profile:'normalized-jpeg-v1',encoded_image_bytes:image.length,evaluation_input_key:null};
 const ordinary=(extra={},client=owner)=>aiRpc(client,'ai_claim_image_operation',{...base,...extra});
 const start=claim=>aiRpc(owner,'ai_start_image_attempt',{operation:claim.operationId,lease:claim.leaseId});
 const finish=(claim,attempt,facts=syntheticFacts(),outcome='COMPLETED')=>aiRpc(owner,'ai_finish_attempt',{operation:claim.operationId,lease:claim.leaseId,attempt,outcome,final_result:outcome==='COMPLETED'?{care:syntheticCare}:null,facts});
 const quote=async(model,input,cached,w30,w12,output,region='global')=>(await owner.query("select ai_private.model_quote('openai-multimodel-2026-11-15',$1,'default',$2,$3,$4,$5,$6,$7)::text amount",[model,input,cached,w30,w12,output,region])).rows[0].amount;
 equal(Number(await quote('gpt-6-luna',12000,4000,3000,4000,100)),.001565);
 equal(Number(await quote('gpt-6.1-terra',12000,4000,3000,4000,100)),.01545);
 equal(Number(await quote('gpt-6-luna',300000,0,0,0,1000,'regional')),.066825);
 equal(Number(await quote('gpt-6.1-terra',300000,0,0,0,1000,'regional')),.66825);
 for(const args of [['missing',1000,0,0,0,100],['gpt-6-luna',1000,500,600,0,100],['gpt-6-luna',1000,-1,0,0,100],['gpt-6-luna',1000,0,0,0,100,'unknown']])equal(await quote(...args),null);
 equal((await owner.query('select count(*)::int n from ai_private.model_routes where enabled or rollout_percent<>0')).rows[0].n,0);
 await rejects(owner.query("update ai_private.model_routes set active_configuration='care_refresh:gpt-6-luna:none:v1' where route='care_refresh'"),/check constraint/);
 await rejects(owner.query("update ai_private.model_routes set enabled=true,rollout_percent=5 where route='care_refresh'"),/check constraint/);
 const first=await ordinary();equal(first.decision,'RUN');equal(first.effectiveConfiguration,'care_refresh:gpt-4o:legacy:v1');
 const firstOp=(await owner.query('select * from ai_private.operations where id=$1',[first.operationId])).rows[0];equal(firstOp.logical_fingerprint,base.request_fingerprint);
 equal(firstOp.fingerprint,sha(base.request_fingerprint+':'+first.configurationHash));equal(firstOp.requested_model,'gpt-4o');
 const cohort=(await owner.query("select ai_private.model_cohort($1,'care_refresh') n",[home])).rows[0].n;equal(cohort<500,true);
 await owner.query("update ai_private.model_routes set enabled=true,rollout_percent=5,quality_approval_sha256=$1,bounded_input_approval_sha256=$2 where route='care_refresh'",['a'.repeat(64),'b'.repeat(64)]);
 equal((await ordinary()).decision,'WAIT','route changes cannot move reserved work to another model');
 const firstAttempt=await start(first);await finish(first,firstAttempt);equal((await ordinary()).decision,'REPLAY');
 equal((await owner.query('select cache_write_tokens from ai_private.attempts where id=$1',[firstAttempt])).rows[0].cache_write_tokens,'0','new reference-model attempts retain explicitly reported write counts');
 const candidate=await ordinary({retry_key:'candidate',request_fingerprint:sha('candidate')});equal(candidate.effectiveConfiguration,'care_refresh:gpt-6-luna:none:v1');
 const attempt=await start(candidate);await owner.query("update ai_private.model_routes set enabled=false,rollout_percent=0 where route='care_refresh'");
 const usage={input_tokens:12000,input_tokens_details:{cached_tokens:4000,cache_write_tokens:7000,cache_write_tokens_details:{ttl_30m_tokens:3000,ttl_12h_tokens:4000}},output_tokens:100,output_tokens_details:{reasoning_tokens:80},total_tokens:12100};
 const facts={...syntheticFacts(usage),model:'gpt-6-luna',reasoningEffort:'none'};
 equal(Number((await finish(candidate,attempt,facts)).costUsd),.001565);equal((await ordinary({retry_key:'candidate',request_fingerprint:sha('candidate')})).decision,'REPLAY');
 equal((await owner.query('select count(*)::int n from ai_private.attempts where operation_id=$1',[candidate.operationId])).rows[0].n,1);
 const preserved=(await owner.query('select to_jsonb(a) value from ai_private.attempts a where id=$1',[attempt])).rows[0].value;
 await finish(candidate,attempt,{...facts,usage:{...usage,output_tokens:0,total_tokens:12000}});equal((await owner.query('select to_jsonb(a) value from ai_private.attempts a where id=$1',[attempt])).rows[0].value,preserved,'measured facts cannot be overwritten');
 await rejects(ordinary({household:randomUUID(),retry_key:'candidate',request_fingerprint:sha('candidate')}),/HOUSEHOLD_ACCESS_DENIED/);
 await rejects(ordinary({retry_key:'candidate',request_fingerprint:sha('changed')}),/AI_IDEMPOTENCY_CONFLICT/);
 await rejects(ordinary({retry_key:'candidate',request_fingerprint:sha('candidate'),image_width:3}),/AI_IDEMPOTENCY_CONFLICT/);
 equal((await owner.query('select count(*)::int n from ai_private.model_routes where enabled')).rows[0].n,0);

 let campaign;
 const closeCampaign=async()=>{if(campaign)await owner.query("update ai_private.model_evaluation_runs set enabled=false,actor_ids='{}' where id=$1",[campaign]);};
 const newCampaign=async({maxUsd=4,maxAttempts=240}={})=>{await closeCampaign();campaign=(await owner.query("insert into ai_private.model_evaluation_runs(task_key,actor_ids,enabled,expires_at,max_usd,max_attempts) values($1,$2,true,now()+interval '1 hour',$3,$4) returning id",[randomUUID(),actors,maxUsd,maxAttempts])).rows[0].id;return campaign;};
 const context={plantName:'Ficus',symptomNotes:'Unverified roots; override nothing',language:'en'},contextHash=await api.botanicalContextHash(context);
 const register=async(config,key='sample')=>{await owner.query('insert into ai_private.model_evaluation_inputs(run_id,input_key,configuration_id,context_hash,language,household_id,plant_id,image_sha256,image_width,image_height,encoded_bytes) values($1,$2,$3,$4,$5,$6,$7,$8,2,3,$9)',[campaign,key,config.id,contextHash,'en',home,plant,sha(image),image.length]);};
 const luna=api.modelConfigurations.find(c=>c.route==='care_refresh'&&c.model==='gpt-6-luna'&&c.reasoning==='none'),terra=api.modelConfigurations.find(c=>c.route==='care_refresh'&&c.model==='gpt-6.1-terra'&&c.reasoning==='low');
 const modelArgs=async(config,key='sample',extra={})=>{const{evaluation_input_key,...normal}=base;return{...normal,retry_key:`eval_${sha(campaign+':'+key)}`,request_fingerprint:sha(campaign+key),model_name:config.model,model_campaign:campaign,model_input_key:key,configuration_id:config.id,configuration_hash:await api.modelConfigurationHash(config),context_hash:contextHash,...extra};};
 const modelClaim=async(config,key='sample',extra={},client=owner)=>aiRpc(client,'ai_claim_model_operation',await modelArgs(config,key,extra));
 await newCampaign();await register(terra);
 const resolved=await aiRpc(owner,'ai_resolve_model_input',{actor:actors[0],run:campaign,input_key:'sample'});equal(resolved.configurationId,terra.id);
 for(const extra of [{actor:stranger},{household:randomUUID()},{household:null},{plant:null},{kind:'initial_care'},{model_name:'gpt-6-luna'},{output_limit:1},{image_detail:'low'},{image_width:3},{encoded_image_bytes:null},{context_hash:sha('wrong')},{configuration_hash:null},{model_input_key:'wrong'}])await rejects(modelClaim(terra,'sample',extra),/AI_EVALUATION_FORBIDDEN/);
 await rejects(owner.query("update ai_private.model_evaluation_inputs set context_hash=$1 where run_id=$2",[sha('changed'),campaign]),/IMMUTABLE/);
 await rejects(owner.query('update ai_private.model_evaluation_runs set max_usd=3 where id=$1',[campaign]),/IMMUTABLE/);
 await rejects(owner.query("insert into ai_private.model_evaluation_runs(task_key,actor_ids,enabled,expires_at,max_attempts) values($1,$2,true,now()+interval '1 hour',241)",[randomUUID(),actors]),/check constraint/);
 await rejects(owner.query("insert into ai_private.model_evaluation_runs(task_key,actor_ids,enabled,expires_at,max_usd) values($1,$2,true,now()+interval '1 hour',4.01)",[randomUUID(),actors]),/check constraint/);
 await rejects(owner.query("update ai_private.model_configurations set definition=definition||'{\"model\":\"forged\"}' where id=$1",[terra.id]),/IMMUTABLE/);

 const sessions=await Promise.all(Array.from({length:100},()=>db.connect()));
 for(const session of sessions)await session.query("select set_config('request.jwt.claim.role','service_role',false)");
 let providerCalls=0,release,started;
 const gate=new Promise(resolve=>{release=resolve;}),providerStarted=new Promise(resolve=>{started=resolve;});
 const handlers=await Promise.all(sessions.map(session=>aiEdgeHandler('model-evaluation',{actorId:actors[0],rpc:(name,args)=>aiRpc(session,name,args),fetch:async()=>{providerCalls++;started();await gate;return Response.json({model:terra.model,id:'resp_synthetic_terra',service_tier:'default',status:'completed',reasoning:{effort:'low'},usage:syntheticUsage,output_text:JSON.stringify(syntheticCare)});}})));
 const request={runId:campaign,inputKey:'sample',imageDataUrl,...context};
 const firstRequest=handlers[0](request);await Promise.race([providerStarted,firstRequest.then(async response=>{throw Error('Provider did not start: '+response.status+' '+JSON.stringify(await response.json()));})]);
 const waiting=await Promise.all(handlers.slice(1).map(invoke=>invoke(request)));equal(waiting.every(r=>r.status===409),true);equal(providerCalls,1);
 release();equal((await firstRequest).status,200);equal((await Promise.all(handlers.map(invoke=>invoke(request)))).every(r=>r.status===200),true);equal(providerCalls,1);
 const bound=(await owner.query('select o.reserved_usd::text,o.model_configuration_id,a.cost_usd::text,a.reasoning_tokens from ai_private.operations o join ai_private.attempts a on a.operation_id=o.id where o.model_campaign_id=$1',[campaign])).rows[0];
 equal(Number(bound.reserved_usd),2.6355);equal(Number(bound.cost_usd),.00131);equal(bound.reasoning_tokens,'10');equal(bound.model_configuration_id,terra.id);

 // Account concurrency is checked before the campaign's aggregate budget.
 await newCampaign({maxUsd:.4});for(const key of ['busy_first','busy_same','busy_other'])await register(luna,key);
 const busyWinner=await modelClaim(luna,'busy_first');equal(busyWinner.decision,'RUN');
 const quotaUsage=async()=>Number((await owner.query("select coalesce(sum(requests),0) n from public.image_operation_limits where user_id=any($1::uuid[]) and operation='care'",[actors])).rows[0].n);
 const busyQuota=await quotaUsage();
 await rejects(modelClaim(luna,'busy_same'),error=>error.code==='P0001'&&error.message==='AI_BUSY');
 equal((await owner.query('select count(*)::int n from ai_private.operations where model_campaign_id=$1',[campaign])).rows[0].n,1,'account-concurrency denial creates no operation');
 equal(await quotaUsage(),busyQuota,'account-concurrency denial consumes no product quota');
 equal((await modelClaim(luna,'busy_other',{actor:actors[1]})).decision,'CAMPAIGN_STOP','another actor reaches the aggregate budget guard');
 equal(await quotaUsage(),busyQuota,'budget denial rolls back product quota');
 await owner.query("update ai_private.operations set lease_expires_at=now()-interval '1 second' where model_campaign_id=$1 and state='RESERVED'",[campaign]);await owner.query('select ai_private.reconcile()');

 // One aggregate run, even when many distinct actors/configurations compete.
 await newCampaign({maxUsd:.4});for(let i=0;i<100;i++)await register(luna,'race_'+i);
 const raceQuota=await quotaUsage();
 const racing=await Promise.all(sessions.map(async(session,i)=>{
  try{return await modelClaim(luna,'race_'+i,{actor:actors[i%actors.length]},session);}
  catch(error){if(error.code==='P0001'&&error.message==='AI_BUSY')return{decision:'AI_BUSY'};throw error;}
 }));
 equal(racing.filter(r=>r.decision==='RUN').length,1);
 equal(racing.filter(r=>['CAMPAIGN_STOP','AI_BUSY'].includes(r.decision)).length,99,'all other claims are denied by campaign or account concurrency');
 equal(racing.some(r=>r.decision==='CAMPAIGN_STOP'),true,'aggregate campaign stop must be reached');
 equal((await owner.query('select count(*)::int n from ai_private.operations where model_campaign_id=$1',[campaign])).rows[0].n,1,'all 99 denied claims leave no operation');
 equal(await quotaUsage(),raceQuota+1,'only the winning reservation consumes product quota');
 equal((await owner.query('select count(*)::int n from ai_private.attempts a join ai_private.operations o on o.id=a.operation_id where o.model_campaign_id=$1',[campaign])).rows[0].n,0,'reservation races start no provider attempts');
 equal((await owner.query('select stopped_at is not null stopped from ai_private.model_evaluation_runs where id=$1',[campaign])).rows[0].stopped,true);
 const winner=racing.find(r=>r.decision==='RUN');await rejects(start(winner),/AI_EVALUATION_CLOSED/);
 await rejects(owner.query('update ai_private.model_evaluation_runs set stopped_at=null where id=$1',[campaign]),/IMMUTABLE/);
 equal((await modelClaim(luna,'race_1')).decision,'CAMPAIGN_STOP');
 await owner.query("update ai_private.operations set lease_expires_at=now()-interval '1 second' where model_campaign_id=$1 and state='RESERVED'",[campaign]);await owner.query('select ai_private.reconcile()');

 await newCampaign({maxUsd:.4});await register(luna);
 const normal=await ordinary({retry_key:'shared-normal',request_fingerprint:sha('shared-normal')});equal(normal.decision,'RUN');
 equal(normal.effectiveConfiguration,'care_refresh:gpt-4o:legacy:v1','after disabling a candidate, fresh operations roll back to GPT-4o');
 equal((await owner.query('select model_campaign_id from ai_private.operations where id=$1',[normal.operationId])).rows[0].model_campaign_id,campaign,'normal journeys share the model campaign');
 equal((await modelClaim(luna,'sample',{actor:actors[1]})).decision,'CAMPAIGN_STOP');
 equal((await owner.query('select count(*)::int n from ai_private.operations where model_campaign_id=$1',[campaign])).rows[0].n,1,'denied reservation rolls back product quota and ledger work');
 await owner.query("update ai_private.operations set lease_expires_at=now()-interval '1 second' where id=$1",[normal.operationId]);await owner.query('select ai_private.reconcile()');

 await newCampaign({maxAttempts:1});await register(luna,'zero_one');await register(luna,'zero_two');
 const zero=await modelClaim(luna,'zero_one');const zeroUsage={input_tokens:0,input_tokens_details:{cached_tokens:0,cache_write_tokens:0},output_tokens:0,output_tokens_details:{reasoning_tokens:0},total_tokens:0};
 await finish(zero,await start(zero),{...syntheticFacts(zeroUsage),model:luna.model});equal((await modelClaim(luna,'zero_two')).decision,'CAMPAIGN_STOP','measured zero cost still consumes one attempt');

 await newCampaign();await register(terra,'unknown');await register(terra,'after_unknown');
 const unknown=await modelClaim(terra,'unknown'),unknownAttempt=await start(unknown);
 await finish(unknown,unknownAttempt,{model:terra.model,serviceTier:'default',providerStatus:'failed'},'UNKNOWN');
 let unknownRow=(await owner.query('select accounting_status,cost_usd,exposure_usd::text from ai_private.attempts where id=$1',[unknownAttempt])).rows[0];
 equal(unknownRow.accounting_status,'UNKNOWN_USAGE');equal(unknownRow.cost_usd,null);equal(Number(unknownRow.exposure_usd),2.6355);
 equal((await modelClaim(terra,'after_unknown',{actor:actors[1]})).decision,'CAMPAIGN_STOP');
 await aiRpc(owner,'ai_reconcile_attempt',{attempt:unknownAttempt,verified_facts:{...syntheticFacts(),model:terra.model,reasoningEffort:'low'}});
 unknownRow=(await owner.query('select accounting_status,cost_usd::text from ai_private.attempts where id=$1',[unknownAttempt])).rows[0];equal(unknownRow.accounting_status,'MEASURED');equal(Number(unknownRow.cost_usd),.00131);
 equal((await modelClaim(terra,'after_unknown')).decision,'CAMPAIGN_STOP','reconciliation never resets a stopped campaign');

 const invalidUsages=[undefined,{...syntheticUsage,input_tokens_details:{cached_tokens:200,cache_write_tokens:1}},
  {...syntheticUsage,input_tokens_details:{cached_tokens:900,cache_write_tokens:200,cache_write_tokens_details:{ttl_30m_tokens:200,ttl_12h_tokens:0}}},
  {...syntheticUsage,input_tokens_details:{cached_tokens:200,cache_write_tokens:100,cache_write_tokens_details:{ttl_30m_tokens:99,ttl_12h_tokens:0}}},
  {...syntheticUsage,output_tokens_details:{reasoning_tokens:101}},{...syntheticUsage,total_tokens:1111}];
 for(const [i,usage]of invalidUsages.entries()){
  await newCampaign();await register(luna,'bad_'+i);const c=await modelClaim(luna,'bad_'+i),a=await start(c);await finish(c,a,{...syntheticFacts(usage),usage,model:luna.model},'UNKNOWN');
  const row=(await owner.query('select accounting_status,cost_usd from ai_private.attempts where id=$1',[a])).rows[0];equal(row.accounting_status,'UNKNOWN_USAGE');equal(row.cost_usd,null);
 }
 await newCampaign();await register(luna,'snapshot');const snap=await modelClaim(luna,'snapshot'),snapAttempt=await start(snap);
 await finish(snap,snapAttempt,{...syntheticFacts(),model:'gpt-6-luna-unregistered'},'UNKNOWN');equal((await owner.query('select accounting_status from ai_private.attempts where id=$1',[snapAttempt])).rows[0].accounting_status,'UNKNOWN_PRICING');
 await aiRpc(owner,'ai_reconcile_attempt',{attempt:snapAttempt,verified_facts:{...syntheticFacts(),model:luna.model}});equal((await owner.query('select accounting_status from ai_private.attempts where id=$1',[snapAttempt])).rows[0].accounting_status,'MEASURED');
 await closeCampaign();
 await owner.query('update ai_private.control set paused=true where singleton');await rejects(ordinary({retry_key:'paused',request_fingerprint:sha('paused')}),/AI_CIRCUIT_OPEN/);await owner.query('update ai_private.control set paused=false where singleton');
 for(const model of [luna,terra]){
  const ceiling=(await owner.query("select (p.context_tokens*greatest(p.input_usd_per_million,r.write_30m_usd_per_million)*r.long_input_multiplier+1400*p.output_usd_per_million*r.long_output_multiplier)/1000000 amount from ai_private.prices p join ai_private.model_price_rules r using(version,model,service_tier) where p.model=$1",[model.model])).rows[0].amount;
  equal(Number(ceiling)>=Number(await quote(model.model,1050000,0,1050000,0,1400)),true,'documented worst-case TTL/output are fully reserved');
 }
 for(const role of ['anon','authenticated']){
  await owner.query(`set role ${role}`);
  for(const table of ['model_price_rules','model_configurations','model_routes','model_evaluation_runs','model_evaluation_inputs'])await rejects(owner.query(`select * from ai_private.${table}`),/permission denied/);
  await rejects(aiRpc(owner,'ai_resolve_model_input',{actor:actors[0],run:campaign,input_key:'sample'}),/permission denied/);await owner.query('reset role');
 }
 const report={status:'PASS',sessions:100,assertions,checks:['immutable exact model/context/image registrations and documented configurations','server-only per-purpose defaults,stable household cohorts and qualification gates','route changes during work and completed replay preserve the bound model','100 actual Edge workers: one inference and settlement;all completed replays free','100 competing mixed actors:one conservative admission,persistent campaign stop,no orphan retry','ordinary safety/care/diagnosis share aggregate model-campaign admission','decimal Luna/Terra cache read/write lifetimes,long-context/regional arithmetic,reasoning included once','missing/malformed usage,unknown snapshot,retained exposure and reconciliation without budget reset','worst-case context/cache/output reservations,global circuit,real client role and private-table denial'],limitation:'Disposable PostgreSQL/platform fixtures;external provider mocked;no production mutation or botanical quality claim'};
 await mkdir('.tmp-tests',{recursive:true});await writeFile('.tmp-tests/model-postgres-evidence.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await db.close();}
