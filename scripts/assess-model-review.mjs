import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync, writeFileSync, mkdirSync, cpSync, realpathSync, readdirSync, existsSync} from 'node:fs';
import {resolve, join, sep} from 'node:path';
import {build} from 'esbuild';
import {redactReviewIdentity, reviewSha, reviewEscape} from './lib/modelReviewPackage.mjs';
import {analyzeReviewResponse, reviewEvidenceHash, reviewDimensions} from './lib/modelReviewEvidence.mjs';

const [packageDirectory, operatorSources, destination] = process.argv.slice(2);
if (!packageDirectory || !operatorSources || !destination) throw Error('Usage: node scripts/assess-model-review.mjs <verified-extracted-package> <operator-sources.json> <new-output-directory>');
const root = realpathSync(packageDirectory), output = resolve(destination);
assert.ok(output !== root && !output.startsWith(root + sep) && !existsSync(output) && !existsSync(output + '.operator-map.json'), 'Use a separate new output path');
const readBounded = file => { const bytes = readFileSync(file); assert.ok(bytes.length <= 16 * 1024 * 1024, 'Bounded review file'); return bytes; };
const json = file => JSON.parse(readBounded(file));
const originalFiles = [];
const walk = (directory, prefix = '') => {
  for (const entry of readdirSync(directory, {withFileTypes: true})) {
    assert.ok(!entry.isSymbolicLink(), 'Review symlinks forbidden');
    const name = prefix + entry.name;
    if (entry.isDirectory()) { assert.ok(name.split('/').length <= 3, 'Bounded review nesting'); walk(join(directory, entry.name), name + '/'); }
    else {
      assert.ok(entry.isFile() && /^(?:(?:historical-care\/)?assets\/[a-f0-9]{64}\.jpg|(?:historical-care\/)?(?:index\.html|manifest\.json|scores\.json)|reference-corpus\.json|references\.html|README\.md)$/.test(name), 'Unexpected review package resource');
      const bytes = readBounded(join(directory, entry.name)); originalFiles.push({path: name, bytes: bytes.length, sha256: reviewSha(bytes)});
      assert.ok(originalFiles.length <= 500 && originalFiles.reduce((sum, item) => sum + item.bytes, 0) <= 32 * 1024 * 1024, 'Bounded package size');
    }
  }
};
walk(root);
const inside = name => {
  assert.ok(typeof name === 'string' && !name.includes('..') && !name.includes('\\') && !name.includes(':') && !name.startsWith('/'), 'Local review resource required');
  const file = realpathSync(join(root, name)); assert.ok(file.startsWith(root + sep), 'Review path containment'); return file;
};
const sources = json(operatorSources), corpus = json('tests/fixtures/botanical-model-corpus.json');
assert.equal(reviewSha(readBounded(sources.archivePath)), sources.archiveSha256, 'Actual source archive checksum');
const references = json(inside('reference-corpus.json'));
assert.equal(references.references.length, corpus.length);
const cases = new Map(corpus.map(item => [item.id, item]));
assert.equal(cases.size, corpus.length);
assert.equal(new Set(references.references.map(card => card.caseId)).size, corpus.length, 'Complete unique reference-card inventory');
for (const card of references.references) {
  const source = cases.get(card.caseId); assert.ok(source);
  assert.equal(card.imageSha256, source.imageSha256); assert.equal(card.rightsBasis, source.rightsBasis);
  assert.deepEqual(card.license, source.license ?? null); assert.deepEqual(card.referenceIdentities, source.referenceIdentities);
  assert.equal(card.sourceUrl, source.sourceUrl ?? null); assert.equal(card.sourceRevision, source.sourceRevision ?? null);
  assert.equal(card.publishedLabel, source.publishedLabel ?? null);
  assert.equal(reviewSha(readBounded(inside(card.image))), card.imageSha256);
}
const bundle = await build({stdin: {resolveDir: process.cwd(), loader: 'ts', contents: 'export * from "./supabase/functions/_shared/plantCareContract.ts";export * from "./supabase/functions/_shared/plantDiagnosisContract.ts";'}, bundle: true, write: false, format: 'esm'});
const contracts = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const inventory = [], contexts = [], sourceIntegrity = [], operatorAnalysis = [];
for (const section of sources.sections) {
  assert.match(section.name, /^[a-z-]{1,40}$/);
  const manifest = json(inside(section.manifest)), reportBytes = readBounded(section.report), report = JSON.parse(reportBytes), mapping = json(section.operatorMap);
  assert.match(mapping.seed, /^[a-f0-9]{64}$/);
  assert.equal(reviewSha(reportBytes), manifest.sourceSha256, 'Actual report hash must match original manifest');
  assert.equal(mapping.sourceSha256, manifest.sourceSha256);
  assert.equal(mapping.reviewManifestSha256, reviewSha(JSON.stringify(manifest)), 'Original canonical manifest hash');
  const scores = json(inside(section.scores));
  const experimentByKey = new Map(report.experiments.map(item => [item.key, item]));
  const mappingByCode = new Map(mapping.mapping.map(item => [item.blindCode, item]));
  assert.equal(mappingByCode.size, mapping.mapping.length);
  let count = 0;
  for (const context of manifest.contexts) {
    const image = section.imagePrefix + context.image;
    assert.equal(reviewSha(readBounded(inside(image))), context.imageSha256);
    const exactInputs = [];
    for (const item of context.responses) {
      const link = mappingByCode.get(item.blindCode), source = experimentByKey.get(link?.sourceExperiment);
      assert.ok(source && source.responseStatus === 200);
      assert.equal(link.contextKey, context.contextKey);
      assert.equal(createHmac('sha256', Buffer.from(mapping.seed, 'hex')).update(context.contextKey + ':' + source.config.id).digest('hex').slice(0, 16), item.blindCode, 'Original blinding code/configuration binding');
      const original = source.response.evaluation.result;
      assert.equal(reviewSha(JSON.stringify(original)), link.responseSha256);
      assert.deepEqual(redactReviewIdentity(original), item.response, 'Original response integrity after documented identity redaction');
      assert.equal(source.caseId, context.caseId); assert.equal(source.route, context.route); assert.equal(source.language, context.language);
      assert.equal(source.imageSha256, context.imageSha256); assert.equal(source.config.id, link.configurationId);
      assert.deepEqual(Object.keys(source.context).sort(), ['language', 'plantName', 'symptomNotes']);
      assert.ok(typeof source.context.plantName === 'string' && source.context.plantName.length <= 100
        && typeof source.context.symptomNotes === 'string' && source.context.symptomNotes.length <= 1500, 'Bounded recorded context');
      const input = context.route === 'diagnosis' ? source.context : {plantName: source.context.plantName, language: source.context.language};
      exactInputs.push(input);
      const responseId = section.name + ':' + item.blindCode;
      const analysis = analyzeReviewResponse(item.response, context.route, context.language, contracts);
      inventory.push({responseId, blindCode: item.blindCode, section: section.name, caseId: context.caseId, route: context.route, language: context.language,
        imageSha256: context.imageSha256, responseSha256: reviewEvidenceHash(item.response), providerInputSha256: reviewEvidenceHash(input), ...analysis});
      operatorAnalysis.push({responseId, configurationId: source.config.id, sourceExperiment: source.key});
      const worksheet = scores.find(row => row.blindCode === item.blindCode);
      assert.ok(worksheet && worksheet.reviewStatus === 'unreviewed' && Object.values(worksheet.scores).every(value => value === null));
      count++;
    }
    assert.ok(exactInputs.every(input => reviewEvidenceHash(input) === reviewEvidenceHash(exactInputs[0])), 'Paired responses must share the exact provider input');
    contexts.push({section: section.name, contextKey: context.contextKey, caseId: context.caseId, route: context.route, language: context.language,
      image, imageSha256: context.imageSha256, exactRecordedProviderInput: exactInputs[0], inputSourceSha256: manifest.sourceSha256,
      careNotesBoundary: context.route === 'diagnosis' ? null : 'v1 care does not send symptomNotes; only recorded plantName and language are shown',
      responses: context.responses, references: context.references});
  }
  assert.equal(count, scores.length); assert.equal(count, mapping.mapping.length);
  sourceIntegrity.push({section: section.name, responses: count, manifestFileSha256: reviewSha(readBounded(inside(section.manifest))),
    canonicalManifestSha256: mapping.reviewManifestSha256, sourceSha256: manifest.sourceSha256, responseIntegrity: 'PASS'});
}
assert.equal(new Set(inventory.map(item => item.responseId)).size, inventory.length);
const textFiles = ['manifest.json', 'historical-care/manifest.json', 'scores.json', 'historical-care/scores.json', 'reference-corpus.json', 'index.html', 'references.html', 'historical-care/index.html', 'README.md'];
const secretPattern = /\b(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{15,})\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;
for (const file of textFiles) {
  const text = readBounded(inside(file)).toString('utf8');
  assert.ok(!secretPattern.test(text), 'Recognized credential pattern must be absent');
  if (file.endsWith('.html')) assert.ok(!/<script\b|\bon\w+\s*=|<iframe\b|<object\b/i.test(text), 'Static review HTML required');
}
assert.ok(!secretPattern.test(JSON.stringify({contexts, inventory})), 'Recognized credentials must not enter derived review material');
assert.ok(!/gpt-(?:4o|6)|configurationId|costUsd|providerRequestId|actorId/i.test(JSON.stringify({contexts, inventory})), 'Reviewer material must remain blinded');
const worksheet = inventory.map(item => ({responseId: item.responseId, route: item.route, language: item.language, imageSha256: item.imageSha256,
  responseSha256: item.responseSha256, reviewStatus: 'unreviewed', reviewerReference: null, independentCaseGroup: null, independenceEvidence: null,
  referenceIdentityStatus: 'UNKNOWN', referenceEvidence: null, reason: null, treatmentAssessment: null, criticalTreatmentRegression: null,
  criticalFailures: null, languageAssessment: null, languageApproved: null, scores: Object.fromEntries(reviewDimensions.map(key => [key, null]))}));
const rubric = json('tests/fixtures/ai-model-review-rubric.json'), policy = json('tests/fixtures/ai-model-review-thresholds-proposal.json');
const hashes = [...new Set(inventory.map(item => item.imageSha256))];
const coverage = ['initial_care', 'care_refresh', 'diagnosis'].map(route => {
  const rows = inventory.filter(item => item.route === route);
  return {route, outputs: rows.length, contexts: contexts.filter(item => item.route === route).length, distinctOutputImages: new Set(rows.map(item => item.imageSha256)).size,
    languages: Object.fromEntries(['en', 'sk', 'de', 'fr', 'es'].map(language => [language, rows.filter(item => item.language === language).length])), independentReviewedCases: 0};
});
const evidence = {schemaVersion: 'step53-review-assessment-v1', archiveSha256: sources.archiveSha256, sourceIntegrity, referenceCards: references.references.length,
  originalFiles,
  originalImageHashes: new Set(references.references.map(item => item.imageSha256)).size, outputs: inventory.length, contexts: contexts.length,
  distinctOutputImages: hashes.length, engineeringInspectedOutputs: inventory.length, independentlyReviewedOutputs: 0, independentReviewedCases: 0,
  structuralPass: inventory.filter(item => item.structuralStatus === 'PASS').length, structuralFail: inventory.filter(item => item.structuralStatus === 'FAIL').length,
  possibleWrongLanguage: inventory.filter(item => item.languageIndicator !== 'NO_INDICATOR').map(item => item.responseId),
  explicitIntervalMismatches: inventory.filter(item => item.wateringIntervalIndicator !== 'NO_INDICATOR').map(item => item.responseId),
  coverage, rubricSha256: reviewEvidenceHash(rubric), proposedPolicySha256: reviewEvidenceHash(policy), inventorySha256: reviewEvidenceHash(inventory),
  candidateActivation: false, newPaidProviderAttempts: 0, newPaidSpendingUsd: '0.000000000000',
  limitations: ['Engineering indicators are not horticultural, chemical-safety or native-language approval.', 'Exact image duplicates are grouped; biological independence and near-duplicate physical leaves remain UNKNOWN.', 'Reference crop labels cannot validate hidden roots, causes or treatment. Original source reports are not included in reviewer material.']};
mkdirSync(output);
cpSync(root, join(output, 'original'), {recursive: true, force: false, errorOnExist: true});
for (const context of contexts) context.image = 'original/' + context.image;
const write = (name, value) => writeFileSync(join(output, name), JSON.stringify(value, null, 2), {flag: 'wx'});
write('engineering-analysis.json', inventory); write('contexts.json', contexts); write('review-worksheet-v1.json', worksheet);
write('rubric.json', rubric); write('thresholds-proposal.json', policy); write('assessment-manifest.json', evidence);
const html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PlantieCare independent review preparation</title><style>body{font:16px/1.5 system-ui;margin:auto;padding:24px;max-width:1200px;background:#f5f8f5;color:#172c23}section{background:white;border:1px solid #ccd8ce;padding:20px;margin:24px 0;border-radius:12px}img{max-width:100%;max-height:420px}pre{white-space:pre-wrap;overflow-wrap:anywhere}article{border-top:1px solid #ccd8ce;padding-top:12px}.notice{padding:16px;background:#fff2d7}</style><h1>Blinded botanical review preparation</h1><p class="notice">UNREVIEWED. Rubric and thresholds are proposals awaiting independent approval. Automated indicators are review prompts. Score the evidence before consulting any model mapping or cost report.</p><p><a href="review-worksheet-v1.json">New worksheet</a> · <a href="rubric.json">Proposed rubric</a> · <a href="original/references.html">Original references and rights</a> · <a href="assessment-manifest.json">Integrity and coverage</a></p>' + contexts.map(context => '<section><h2>' + reviewEscape(context.section + ' / ' + context.contextKey) + '</h2><img src="' + reviewEscape(context.image) + '" alt="Original approved reference"><h3>Exact recorded provider input</h3><pre>' + reviewEscape(JSON.stringify(context.exactRecordedProviderInput, null, 2)) + '</pre><p>' + reviewEscape(context.careNotesBoundary ?? 'User claims are untrusted context, not reference truth.') + '</p><details><summary>Reference evidence and unknowns</summary><pre>' + reviewEscape(JSON.stringify(context.references, null, 2)) + '</pre></details>' + context.responses.map(item => '<article><h3>' + reviewEscape(context.section + ':' + item.blindCode) + '</h3><pre>' + reviewEscape(JSON.stringify(item.response, null, 2)) + '</pre></article>').join('') + '</section>').join('') + '</html>';
writeFileSync(join(output, 'index.html'), html, {flag: 'wx'});
writeFileSync(output + '.operator-map.json', JSON.stringify(operatorAnalysis, null, 2), {flag: 'wx'});
console.log(JSON.stringify(evidence));
