import assert from 'node:assert/strict';import{createHash,randomUUID}from'node:crypto';import{readFile,mkdir,writeFile}from'node:fs/promises';
import{createAiTestDatabase,aiRpc,createApprovedTestCampaign}from'./lib/aiTestDatabase.mjs';import{syntheticCare,syntheticFacts}from'../tests/fixtures/aiEdgeHarness.mjs';
const db=await createAiTestDatabase(),{owner}=db;let assertions=0;const equal=(a,b,message)=>{assert.deepEqual(a,b,message);assertions++;};const rejects=async(p,re)=>{await assert.rejects(p,re);assertions++;};
const sha=s=>createHash('sha256').update(s).digest('hex'),registry=JSON.parse(await readFile('tests/fixtures/ai-luna-manifest.json','utf8'));
const actor=randomUUID(),viewer=randomUUID(),stranger=randomUUID(),plant=randomUUID(),routes=['initial_care','care_refresh','diagnosis','image_safety'];
const cohort=(id,route)=>createHash('md5').update(id+':'+route).digest().readUInt32BE()%10000;
let household;for(let i=0;i<2000000;i++){const id='60000000-0000-4000-8000-'+i.toString().padStart(12,'0');if(routes.every(route=>cohort(id,route)<500)){household=id;break;}}assert.ok(household);
try{
 for(const id of [actor,viewer,stranger])await owner.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",[id,`synthetic-${id}@example.invalid`]);
 await owner.query("insert into public.households(id,name,created_by,premium_enabled,plan_key) values($1,'Synthetic Luna fixture',$2,true,'premium')",[household,actor]);
 for(const [i,id]of[actor,viewer].entries())await owner.query("insert into public.household_members(household_id,user_id,role,status) values($1,$2,$3,'active')",[household,id,i?'viewer':'owner']);
 await owner.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
 const addPlant=async(id,path=null)=>owner.query("insert into public.plants(id,household_id,source,display_name,likely_name,identification,identification_note,short_care,light,watering,soil,created_by,image_path) values($1,$2,'custom','Synthetic','Synthetic','likely','','','','','',$3,$4)",[id,household,actor,path]);
 await addPlant(plant);await owner.query('update ai_private.control set account_per_minute=100 where singleton');
 equal(await aiRpc(owner,'ai_owner_access',{actor}),false,'Household owner is not global owner');
 for(const id of[actor,viewer,stranger])await rejects(aiRpc(owner,'ai_owner_finops',{actor:id}),/OWNER_ACCESS_DENIED/);
 await owner.query("insert into ai_private.owner_operators(user_id,authorization_reference) values($1,'Disposable explicit owner enrollment')",[actor]);
 equal(await aiRpc(owner,'ai_owner_access',{actor}),true);equal(await aiRpc(owner,'ai_owner_access',{actor:viewer}),false);
 await rejects(owner.query("update ai_private.model_routes set quality_approval_sha256='invalid' where route='care_refresh'"),/check constraint/);
 await rejects(owner.query("update ai_private.model_routes set bounded_input_approval_sha256='invalid' where route='care_refresh'"),/check constraint/);
 const before=await aiRpc(owner,'ai_owner_finops',{actor});equal(before.subscriptions.netCollectedRevenue,null);equal(before.subscriptions.payingHouseholds,null);equal(before.household.targetsAreQuotas,false);
 await rejects(owner.query("insert into ai_private.model_evaluation_runs(task_key,actor_ids,enabled,expires_at) values($1,$2,true,now()+interval '1 hour')",[randomUUID(),[actor]]),/AI_EVALUATION_FORBIDDEN/);
 const base={actor,household,plant,kind:'care_refresh',retry_key:'legacy-pin',request_fingerprint:sha('legacy-pin'),image_sha256:sha('synthetic-image'),model_name:'gpt-6-luna',prompt_schema_version:'plant-care-v1',output_limit:1400,image_width:2,image_height:3,image_detail:'high',preprocessing_profile:'normalized-jpeg-v1',encoded_image_bytes:128,evaluation_input_key:null};
 const claim=(key,route='care_refresh',extra={})=>aiRpc(owner,'ai_claim_image_operation',{...base,retry_key:key,request_fingerprint:sha(key),kind:route==='image_safety'?'image_validation':route,plant:route==='care_refresh'||route==='diagnosis'?plant:null,prompt_schema_version:route==='diagnosis'?'plant-diagnosis-v1':route==='image_safety'?'plant-image-safety-luna-none-v2':'plant-care-v1',output_limit:route==='diagnosis'?2400:route==='image_safety'?700:1400,...extra});
 const settle=async(c,model='gpt-6-luna',result={care:syntheticCare})=>{const attempt=await aiRpc(owner,'ai_start_image_attempt',{operation:c.operationId,lease:c.leaseId});return aiRpc(owner,'ai_finish_attempt',{operation:c.operationId,lease:c.leaseId,attempt,outcome:'COMPLETED',final_result:result,facts:{...syntheticFacts(),model,reasoningEffort:model==='gpt-6-luna'?'none':undefined}});};
 const legacy=await claim('legacy-pin','care_refresh',{actor:viewer});equal(legacy.effectiveConfiguration,'care_refresh:gpt-4o:legacy:v1');
 // A retained unknown exists before approval, at the exact conservative amount.
 const campaign=await createApprovedTestCampaign(owner,[actor],{imageHashes:[base.image_sha256]});
 const luna=registry.find(c=>c.id==='care_refresh:gpt-6-luna:none:v1');
 await owner.query("insert into ai_private.model_evaluation_inputs(run_id,input_key,configuration_id,context_hash,language,household_id,plant_id,image_sha256,image_width,image_height,encoded_bytes) values($1,'unknown',$2,$3,'en',$4,$5,$6,2,3,128)",[campaign,luna.id,sha('context'),household,plant,base.image_sha256]);
 const {evaluation_input_key,...modelBase}=base;
 const unknown=await aiRpc(owner,'ai_claim_model_operation',{...modelBase,retry_key:'eval_'+sha(campaign+':unknown'),request_fingerprint:sha('unknown'),model_campaign:campaign,model_input_key:'unknown',configuration_id:luna.id,configuration_hash:luna.hash,context_hash:sha('context')});
 const unknownAttempt=await aiRpc(owner,'ai_start_image_attempt',{operation:unknown.operationId,lease:unknown.leaseId});
 await aiRpc(owner,'ai_finish_attempt',{operation:unknown.operationId,lease:unknown.leaseId,attempt:unknownAttempt,outcome:'UNKNOWN',final_result:null,facts:{model:'gpt-6-luna'}});
 const unknownFacts=(await owner.query('select to_jsonb(a) value from ai_private.attempts a where id=$1',[unknownAttempt])).rows[0].value;
 equal(unknownFacts.accounting_status,'UNKNOWN_USAGE');equal(Number(unknownFacts.exposure_usd),.26355);equal(unknownFacts.cost_usd,null);
 equal((await owner.query('select stopped_at is not null stopped from ai_private.model_evaluation_runs where id=$1',[campaign])).rows[0].stopped,true);
 await owner.query("update ai_private.model_evaluation_runs set enabled=false,actor_ids='{}' where id=$1",[campaign]);
 // An exact approved fixture may supply its hash without rewriting the signed
 // proposal. Missing/wrong/rejected fixtures and explicit empty lists fail closed.
 for(const [index,projection,allowed] of [
  [0,{fixtures:[{sha256:base.image_sha256,expected:'ALLOW'}]},true],
  [1,{fixtures:[{sha256:sha('different'),expected:'ALLOW'}]},false],
  [2,{fixtures:[{sha256:base.image_sha256,expected:'REJECT'}]},false],
  [3,{fixtures:[]},false],
  [4,{imageHashes:[],fixtures:[{sha256:base.image_sha256,expected:'ALLOW'}]},false],
  [5,{imageHashes:[base.image_sha256]},true],
 ]){
  const plan={configurationHashes:{[luna.id]:luna.hash},...projection},proposal=sha(JSON.stringify(plan));
  await owner.query('insert into ai_private.luna_campaign_proposals(sha256,plan,max_attempts,max_usd,duration_seconds) values($1,$2,1,1,1800)',[proposal,plan]);
  const approved=await aiRpc(owner,'ai_owner_approve_campaign',{actor,proposal_sha256:proposal});
  const run=(await owner.query("insert into ai_private.model_evaluation_runs(task_key,actor_ids,enabled,expires_at,max_attempts,max_usd,owner_campaign_approval_id) values($1,$2,true,now()+interval '30 minutes',1,1,$3) returning id",[randomUUID(),[actor],approved.id])).rows[0].id;
  const register=()=>owner.query("insert into ai_private.model_evaluation_inputs(run_id,input_key,configuration_id,context_hash,language,household_id,plant_id,image_sha256,image_width,image_height,encoded_bytes) values($1,'format_probe',$2,$3,'en',$4,$5,$6,2,3,128)",[run,luna.id,sha('format'),household,plant,base.image_sha256]);
  if(allowed){await register();assertions++;}else await rejects(register(),/AI_EVALUATION_FORBIDDEN/);
  await owner.query("update ai_private.model_evaluation_runs set enabled=false,actor_ids='{}' where id=$1",[run]);
 }
 const hashes=Object.fromEntries(registry.map(c=>[c.id,c.hash])),safety=registry.filter(c=>c.definition.route==='image_safety').map(c=>c.id),categories=['healthy_plant','damaged_plant','pests','non_plant','documents','faces','screenshots','mixed_sensitive','blurred','extremely_dark','small_restricted_details','multiple_plants','ambiguous','corrupted','oversized'];
 await owner.query("insert into ai_private.luna_evidence(sha256,release_revision,configurations,safety_configuration_ids,known_disallowed_cases,false_acceptances,safety_fixture_manifest_sha256,safety_categories,provider_attempts,measured_usd,new_unknown_exposure,engineering_checks_passed,limitations) values($1,$2,$3,$4,17,0,$5,$6,44,.01,0,true,'Disposable synthetic gate fixture; not production quality evidence')",[sha('evidence'),'a'.repeat(40),hashes,safety,sha('fixtures'),categories]);
 const primary=registry.filter(c=>c.definition.reasoning==='none').map(c=>c.id),recovery=registry.filter(c=>c.definition.reasoning==='low').map(c=>c.id);
 const args={actor,evidence_sha256:sha('evidence'),configuration_ids:primary,recovery_configuration_ids:recovery,approved_stages:[5,10,25,50,100],rollback_conditions:'Pause on safety/security/accounting failures; Luna-only recovery.'};
 await rejects(aiRpc(owner,'ai_owner_accept_risk',{...args,actor:viewer}),/OWNER_ACCESS_DENIED/);
 await rejects(aiRpc(owner,'ai_owner_accept_risk',{...args,approved_stages:[100]}),/AI_QUALIFICATION_EVIDENCE_REQUIRED/);
 const acceptance=await aiRpc(owner,'ai_owner_accept_risk',args);equal(acceptance.state,'OWNER_ACCEPTED_UNREVIEWED_MIGRATION');equal(acceptance.independentReview,false);
 equal((await owner.query('select count(*)::int n from ai_private.owner_stage_grants where acceptance_id=$1',[acceptance.id])).rows[0].n,20);
 const stage=(route,percent)=>(owner.query('select id from ai_private.owner_stage_grants where acceptance_id=$1 and route=$2 and stage=$3',[acceptance.id,route,percent])).then(r=>r.rows[0].id);
 const apply=async(route,percent)=>aiRpc(owner,'ai_owner_apply_stage',{grant_id:await stage(route,percent)});
 await rejects(apply('initial_care',10),/AI_STAGE_EVIDENCE_REQUIRED/);
 const results=[];
 for(const percent of[5,10,25,50,100])for(const route of routes){
  const applied=await apply(route,percent);equal(applied.stage,percent);equal(applied.configurationId.includes('gpt-6-luna:none'),true);
  if(percent<100)await rejects(apply(route,percent===5?10:percent===10?25:percent===25?50:100),/AI_STAGE_EVIDENCE_REQUIRED/);
  const selected=await claim(`${route}-${percent}`,route);equal(selected.decision,'RUN');equal(selected.effectiveConfiguration,applied.configurationId);
  await settle(selected,'gpt-6-luna',route==='image_safety'?{validation:{containsPlant:true}}:route==='diagnosis'?{diagnosis:{synthetic:true}}:{care:syntheticCare});
  equal((await claim(`${route}-${percent}`,route)).decision,'REPLAY');results.push({route,stage:percent,operation:selected.operationId});
  if(route==='initial_care'){
   const id=randomUUID(),path=`${household}/plants/${id}/original.jpg`;
   await aiRpc(owner,'ai_bind_uploaded_image',{actor,household,object_path:path,image_sha256:base.image_sha256});await addPlant(id,path);
   equal((await owner.query('select linked_plant_id from ai_private.operations where id=$1',[selected.operationId])).rows[0].linked_plant_id,id);
  }
 }
 equal((await claim('legacy-pin','care_refresh',{actor:viewer})).decision,'WAIT','Pinned historical operation stays on its original model');
 await rejects(aiRpc(owner,'ai_owner_commit_cutover',{acceptance:acceptance.id,release_revision:'b'.repeat(40)}),/AI_CUTOVER_EVIDENCE_REQUIRED/);
 await settle(legacy,'gpt-4o-2024-08-06');equal((await claim('legacy-pin','care_refresh',{actor:viewer})).decision,'REPLAY');
 const stamp=await aiRpc(owner,'ai_owner_commit_cutover',{acceptance:acceptance.id,release_revision:'b'.repeat(40)});assert.ok(stamp);assertions++;
 equal((await owner.query("select count(*)::int n from ai_private.model_routes where active_configuration not like '%:gpt-6-luna:%' or enabled")).rows[0].n,0);
 equal((await aiRpc(owner,'ai_resolve_safety_configuration',{actor,household:null})).id,'image_safety:gpt-6-luna:none:v2','Old clients without household receive Luna safety at full cutover');
 await rejects(owner.query("update ai_private.model_routes set candidate_configuration='diagnosis:gpt-6.1-terra:low:v1' where route='diagnosis'"),/check constraint/);
 await rejects(aiRpc(owner,'ai_claim_operation',{...Object.fromEntries(Object.entries(base).filter(([k])=>!['image_detail','preprocessing_profile','encoded_image_bytes','evaluation_input_key'].includes(k))),retry_key:'forbidden-legacy',request_fingerprint:sha('forbidden-legacy'),model_name:'gpt-4o'}),/AI_CIRCUIT_OPEN/);
 await rejects(aiRpc(owner,'ai_owner_recover_luna',{actor,acceptance:acceptance.id,configuration_id:'diagnosis:gpt-6.1-terra:low:v1'}),/AI_QUALIFICATION_EVIDENCE_REQUIRED/);
 equal((await aiRpc(owner,'ai_owner_recover_luna',{actor,acceptance:acceptance.id,configuration_id:'diagnosis:gpt-6-luna:low:v1'})).newOperationsOnly,true);
 const reservedRecovery=await claim('diagnosis-recovery','diagnosis');equal(reservedRecovery.effectiveConfiguration,'diagnosis:gpt-6-luna:low:v1');
 await aiRpc(owner,'ai_owner_revoke',{actor,acceptance:acceptance.id});
 await rejects(aiRpc(owner,'ai_start_image_attempt',{operation:reservedRecovery.operationId,lease:reservedRecovery.leaseId}),/AI_CIRCUIT_OPEN/);
 for(const route of routes)await rejects(claim(`revoked-${route}`,route),/AI_CIRCUIT_OPEN/);
 equal((await owner.query('select to_jsonb(a) value from ai_private.attempts a where id=$1',[unknownAttempt])).rows[0].value,unknownFacts,'Original unknown financial record is byte-identical');
 const finances=await aiRpc(owner,'ai_owner_finops',{actor});equal(Number(finances.unknownExposureAllTime),.26355);equal(finances.subscriptions.netCollectedRevenue,null);
 for(const role of['anon','authenticated','service_role']){await owner.query(`set role ${role}`);await rejects(owner.query('select * from ai_private.owner_operators'),/permission denied/);await owner.query('reset role');}
 const grants=(await owner.query("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'ai_owner_%' and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))")).rows;equal(grants,[]);
 const report={status:'PASS',assertions,stages:results.length,checks:['global owner distinct from household Owner/Viewer','separate immutable spending and unreviewed risk acceptance','twenty exact-hash stage grants; evidence required at every advance','new Luna operation/save/replay on each route at 5/10/25/50/100','legacy in-flight pin and drained atomic cutover','all four active routes and household-less safety Luna at cutover','no Terra or GPT-4o new provider operation after cutover','explicit qualified Luna low recovery for new operations only','revocation pauses routes without expensive fallback','unchanged prior UNKNOWN_USAGE facts and conservative exposure','owner-only FinOps; sandbox not invented collected revenue; real role denial'],limitation:'Disposable PostgreSQL with synthetic SQL/provider facts, not measured production or botanical qualification.'};
 await mkdir('.tmp-tests',{recursive:true});await writeFile('.tmp-tests/luna-postgres-evidence.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await db.close();}
