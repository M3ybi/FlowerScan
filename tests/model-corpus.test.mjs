import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {summarizeModelCorpus,validateModelCase,qualifyModelRoute,projectModelJourneys} from '../scripts/lib/modelEvaluation.mjs';
const corpus=JSON.parse(await readFile('tests/fixtures/botanical-model-corpus.json','utf8'));
const policy=JSON.parse(await readFile('tests/fixtures/ai-model-acceptance-policy.json','utf8'));
test('published licensed labels remain partial ground truth and do not approve their own evaluation',()=>{
 const s=summarizeModelCorpus(corpus);assert.equal(s.cases,76);assert.equal(s.publishedLabelCases,60);assert.equal(s.fullyIndependentlyReviewedCases,0);assert.equal(s.status,'PARTIAL');
 assert.deepEqual(Object.keys(s.languages).sort(),['de','en','es','fr','sk']);assert.equal(qualifyModelRoute(policy,corpus).activationAllowed,false);
 for(const c of corpus.filter(c=>c.sourceUrl)){assert.equal(c.license.id,'CC-BY-SA-3.0');assert.equal(c.reviewStatus,'unreviewed');assert.ok(c.referenceUncertainty.physicalLeafIndependence.startsWith('UNKNOWN'));}
 assert.ok(corpus.some(c=>c.coverageBasis?.startsWith('Unreviewed context scenario')));
});
test('corpus provenance rejects duplicate IDs, unapproved sources, missing hashes and invented approval',()=>{
 assert.throws(()=>summarizeModelCorpus([corpus[0],corpus[0]]),/Duplicate/);
 for(const change of [{imageSha256:null},{language:'xx'},{categories:[]},{sourceUrl:'https://unapproved.invalid/photo.jpg'},{license:{id:'unknown'}}])assert.throws(()=>validateModelCase({...corpus[0],...change}));
 assert.equal(qualifyModelRoute({...policy,botanicalReview:{status:'independently_reviewed',reviewerReference:'Fixture only',approvalSha256:'a'.repeat(64)}},[]).activationAllowed,false);
});
test('financial projections include complete journey components, explicit FX and net revenue assumptions',()=>{
 const result=projectModelJourneys({journeyCosts:{add:.01,diagnosis:.008,refresh:.006,replay:0,expiry:.004,failedExposure:.334},mix:{add:.2,diagnosis:.5,refresh:.15,replay:.1,expiry:.04,failedExposure:.01},usdToEur:.9,monthlyJourneys:100,netRevenueEur:2.5});
 assert.ok(Math.abs(result.usd-1.04)<1e-10);assert.ok(Math.abs(result.eur-.936)<1e-10);assert.equal(result.forecast,false);
 assert.throws(()=>projectModelJourneys({journeyCosts:{add:.01},mix:{add:1,missing:.1},usdToEur:1,monthlyJourneys:10,netRevenueEur:0}),/mix/);
});
