import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['src/lib/householdProfitability.ts'],bundle:true,write:false,format:'esm'});
const {projectHouseholdEconomics:project,defaultFinancialAssumptions:assumptions}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const costs={initial:.000314635,refresh:.000367725,diagnosis:.00037637,safety:null};
test('all 56 household scenarios retain unknown Luna safety costs and label projections',()=>{
 const rows=project(costs);assert.equal(rows.length,56);
 assert.equal(rows.every(row=>row.aiUsd===null&&row.contributionEur===null&&row.breakEvenScans===null&&row.projected),true);
});
test('measured input costs, FX and explicit deductions drive contribution and break-even without new quotas',()=>{
 const rows=project({...costs,safety:.0002});const cold=rows.find(row=>row.scenario==='cold_diagnosis'&&row.scans===1000);
 assert.equal(cold.aiUsd,(.00037637+.0002)*1000);
 const net=3.99/1.23*.7*.97-3.99*.01-.1-.05-.05;
 assert.ok(Math.abs(cold.contributionEur-(net-cold.aiUsd/1.1))<1e-12);
 assert.equal(cold.breakEvenScans,Math.floor(net*1.1/(.00037637+.0002)));
 assert.ok(project({...costs,safety:1}).find(row=>row.scenario==='stress'&&row.scans===3000).contributionEur<0);
});
test('invalid, missing and zero-cost assumptions cannot produce fabricated finite break-even',()=>{
 for(const bad of [{...costs,initial:NaN},{...costs,refresh:-1},{...costs,diagnosis:Infinity}])assert.throws(()=>project(bad),/Invalid/);
 assert.throws(()=>project(costs,{...assumptions,usdPerEur:0}),/Invalid/);
 assert.throws(()=>project(costs,{...assumptions,refundRate:2}),/Invalid/);
 assert.equal(project({initial:0,refresh:0,diagnosis:0,safety:0}).every(row=>row.breakEvenScans===null),true);
});
