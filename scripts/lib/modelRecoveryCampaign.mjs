// Planning only. This module has no provider, database or entitlement client.
const units=value=>{if(typeof value!=='string'||!/^\d+(?:\.\d{1,12})?$/.test(value))throw Error('Exact decimal required');const[w,f='']=value.split('.');return BigInt(w)*1000000000000n+BigInt(f.padEnd(12,'0'));};
export const recoveryContexts=Object.freeze([
 ['diagnosis','houseplant_01','en','healthy_appearance'],['diagnosis','pv_058','es','yellowing'],['diagnosis','houseplant_06','en','brown_tips'],
 ['diagnosis','pv_034','de','suspected_lesions'],['diagnosis','pv_055','fr','suspected_pest_damage'],['diagnosis','houseplant_13','de','insufficient_evidence'],
 ['diagnosis','houseplant_15','es','contradictory_notes'],['diagnosis','houseplant_14','fr','misleading_claim'],['diagnosis','houseplant_16','en','chemical_request'],
 ['diagnosis','houseplant_07','sk','ambiguous_causes'],
 ['care_refresh','houseplant_01','en','care_contract'],['care_refresh','houseplant_07','sk','care_contract'],['care_refresh','pv_034','de','explicit_compatibility_reproduction'],
 ['care_refresh','pv_055','fr','care_contract'],['care_refresh','pv_058','es','care_contract'],
]);
export const recoveryCampaignPreflight=({inputs,reservations,budgetUsd='2.000000000000',maximumAttempts=100})=>{
 if(!Array.isArray(inputs)||inputs.length!==75||!Number.isInteger(maximumAttempts)||maximumAttempts>100||maximumAttempts<90||units(budgetUsd)>units('2.000000000000')||units(budgetUsd)<=0n)throw Error('Invalid proposed campaign');
 const groups=new Set(inputs.map(x=>x.contextKey));if(groups.size!==15||new Set(inputs.map(x=>x.inputKey)).size!==75)throw Error('Incomplete fixed matrix');
 for(const rows of Map.groupBy(inputs,x=>x.contextKey).values())if(rows.length!==5||new Set(rows.map(x=>x.configurationId)).size!==5||new Set(rows.map(x=>x.contextHash)).size!==1||new Set(rows.map(x=>x.imageSha256)).size!==1)throw Error('Unpaired model inputs');
 for(const row of inputs)if(!/^[a-f0-9]{64}$/.test(row.configurationHash)||!/^[a-f0-9]{64}$/.test(row.contextHash)||!/^[a-f0-9]{64}$/.test(row.imageSha256)||!reservations[row.configurationId])throw Error('Unbound campaign input');
 const blockedConfigurations=[...new Set(inputs.filter(x=>units(reservations[x.configurationId])>units(budgetUsd)).map(x=>x.configurationId))];
 return{status:'PAID BENCHMARK BLOCKED',authorization:'NOT AUTHORIZED',budgetUsd,maximumAttempts,plannedGenerationAttempts:75,maximumSafetyAttempts:15,maximumPlannedAttempts:90,maximumRuntimeMinutes:60,
  identities:{count:2,roles:['temporary Premium owner','temporary active viewer'],scope:'One new owned household/plant;bind actual Auth/household IDs only after explicit budget approval;no customer records'},
  blockedConfigurations,financiallyExecutable:blockedConfigurations.length===0,diagnosisFirst:true,minimumGroupSpacingPerActorSeconds:120,
  stopPolicy:['Preflight must pass before any run or paid attempt','One safety validation per group;stop if the group outlives its four-minute authorization window','Stop on first financial denial or unknown usage/pricing;no retry/reset/extra campaign','Close run,clear actors/registrations,sign out,delete only owned fixtures;retain ledger and exposure'],
  limitations:['No budget authorization is implied by preparing a plan.','The full-context Terra reservation exceeds the proposed $2 ceiling. No smaller rigorous bound has been established.','A realistic cost forecast for diagnosis is NOT MEASURED. Illustrative token scenarios cannot replace pre-spend bounds.']};
};
