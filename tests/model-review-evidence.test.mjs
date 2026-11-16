import assert from 'node:assert/strict';
import test from 'node:test';
import {generateKeyPairSync, sign} from 'node:crypto';
import {readFileSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from 'esbuild';
import {reviewDimensions, reviewEvidenceHash, reviewSignatureBytes, verifyReviewSignature, validateReviewRubric, validateReviewRows, validateSignedReview, costPerAcceptableResult, analyzeReviewResponse} from '../scripts/lib/modelReviewEvidence.mjs';
import {qualifyModelRoute} from '../scripts/lib/modelEvaluation.mjs';
import {importModelReview} from '../scripts/import-model-review.mjs';
import {syntheticCare} from './fixtures/aiEdgeHarness.mjs';

const rubric = JSON.parse(readFileSync('tests/fixtures/ai-model-review-rubric.json'));
const policy = JSON.parse(readFileSync('tests/fixtures/ai-model-review-thresholds-proposal.json'));
const inventory = [{responseId: 'current:negative-test', responseSha256: 'a'.repeat(64), imageSha256: 'b'.repeat(64), caseId: 'untrusted_case', route: 'diagnosis', language: 'en'}];
// Deliberately untrusted attack input. No test creates an accepted botanical,
// language, policy, route or production approval, or persists a signing key.
const untrustedClaim = () => ({...inventory[0], reviewStatus: 'independently_reviewed', reviewerReference: 'UNTRUSTED NEGATIVE-TEST CLAIM',
  independentCaseGroup: 'untrusted_group', independenceEvidence: 'UNTRUSTED TEST DATA', referenceIdentityStatus: 'CONFIRMED', referenceEvidence: 'UNTRUSTED TEST DATA',
  treatmentAssessment: 'UNTRUSTED TEST DATA', criticalTreatmentRegression: false, criticalFailures: [], languageAssessment: 'UNTRUSTED TEST DATA', languageApproved: true,
  scores: Object.fromEntries(reviewDimensions.map(key => [key, 1]))});
const input = () => ({submission: {payload: {kind: 'worksheet-review', claim: 'REVIEWED', reviewerReference: 'UNTRUSTED NEGATIVE-TEST CLAIM',
  rows: [untrustedClaim()], reviewManifestSha256: 'c'.repeat(64), archiveSha256: 'd'.repeat(64), policySha256: reviewEvidenceHash(policy), rubricSha256: reviewEvidenceHash(rubric)}},
  policy, rubric, inventory, manifestSha256: 'c'.repeat(64), archiveSha256: 'd'.repeat(64), trust: {keys: []}, now: Date.parse('2026-11-16T10:00:00Z')});

test('proposed rubric is structurally complete but cannot approve itself', () => {
  assert.deepEqual(validateReviewRubric(rubric), []);
  assert.equal(rubric.status, 'PROPOSED_NOT_APPROVED');
  for (const change of [{scale: [0, 1]}, {dimensions: {}}, {criticalFailures: {}}, {unknownState: 'healthy'}]) assert.ok(validateReviewRubric({...rubric, ...change}).length);
  assert.equal(validateSignedReview(input()).activationAllowed, false);
});
test('incomplete worksheets, omitted scores and missing independent groups fail closed', () => {
  assert.ok(validateReviewRows([], inventory, rubric).errors.includes('INCOMPLETE_WORKSHEET'));
  for (const change of [{scores: {}}, {independentCaseGroup: null}, {reviewStatus: 'unreviewed'}, {reviewerReference: ''}]) {
    const report = validateReviewRows([{...untrustedClaim(), ...change}], inventory, rubric);
    assert.ok(report.errors.length); assert.equal(report.independentlyVerified, false);
  }
});
test('duplicate response IDs and splitting the same photo into independent groups are rejected', () => {
  assert.ok(validateReviewRows([untrustedClaim(), untrustedClaim()], inventory, rubric).errors.includes('DUPLICATE_OR_UNKNOWN_RESPONSE'));
  const second = {...inventory[0], responseId: 'historical:negative-test', caseId: 'different_context_same_photo'};
  const report = validateReviewRows([untrustedClaim(), {...untrustedClaim(), ...second, independentCaseGroup: 'inflated_group'}], [...inventory, second], rubric);
  assert.ok(report.errors.includes('DUPLICATE_PHOTO_SPLIT_INTO_GROUPS')); assert.equal(report.independentlyVerified, false);
});
test('empty treatment assessment, unspecified safety and critical failures reject qualification evidence', () => {
  for (const change of [{treatmentAssessment: null}, {criticalTreatmentRegression: null}, {criticalFailures: null}, {criticalFailures: ['invented']}, {criticalTreatmentRegression: true}]) {
    assert.ok(validateReviewRows([{...untrustedClaim(), ...change}], inventory, rubric).errors.length);
  }
});
test('unknown reference identity stays unreviewable and cannot become a passing botanical score', () => {
  assert.ok(validateReviewRows([{...untrustedClaim(), referenceIdentityStatus: 'UNKNOWN'}], inventory, rubric).errors.includes('UNKNOWN_REFERENCE_IDENTITY'));
  const row = {...untrustedClaim(), reviewStatus: 'NOT_REVIEWABLE', reason: 'Reference identity unconfirmed', scores: Object.fromEntries(reviewDimensions.map(key => [key, null]))};
  const result = validateReviewRows([row], inventory, rubric); assert.equal(result.completeRows, 0); assert.equal(result.notReviewableRows, 1); assert.equal(result.claimedIndependentGroups, 0);
});
test('missing signatures, wrong manifest, unsupported approval claims and omitted margin are reported', () => {
  const report = validateSignedReview(input());
  assert.ok(report.errors.includes('MISSING_OR_INVALID_REVIEW_SIGNATURE')); assert.ok(report.errors.includes('MISSING_OR_INVALID_POLICY_SIGNATURE'));
  const wrong = input(); wrong.submission.payload.reviewManifestSha256 = 'e'.repeat(64);
  assert.ok(validateSignedReview(wrong).errors.includes('REVIEW_MANIFEST_HASH_MISMATCH'));
  assert.ok(report.errors.includes('ASSESSMENT_OR_INVENTORY_HASH_MISMATCH'));
  const claim = input(); claim.submission.payload.claim = 'QUALIFIED'; assert.ok(validateSignedReview(claim).errors.includes('UNSUPPORTED_QUALITY_CLAIM'));
  const missing = input(); missing.policy = {...policy, nonInferiorityMargin: null}; assert.ok(validateSignedReview(missing).errors.includes('MISSING_OR_INVALID_NONINFERIORITY_MARGIN'));
});
test('language assessment and signed semantic approvals cannot be replaced by language detection', () => {
  assert.ok(validateReviewRows([{...untrustedClaim(), languageAssessment: null}], inventory, rubric).errors.includes('INVALID_LANGUAGE_ASSESSMENT'));
  assert.ok(validateSignedReview({...input(), languageReviews: [{payload: {language: 'en', approved: true}}]}).errors.includes('MISSING_OR_INVALID_LANGUAGE_APPROVAL'));
});
test('crypto transport authenticates only a pinned key, role, identity, payload and validity window', () => {
  // This is a non-approval test message with no clinical or release role.
  const {privateKey, publicKey} = generateKeyPairSync('ed25519');
  const payload = {kind: 'test-message-not-an-approval', reviewerReference: 'transport-test-only', issuedAt: '2026-11-16T09:00:00Z', expiresAt: '2026-11-16T11:00:00Z'};
  const envelope = {payload, keyId: 'ephemeral-transport-test', signatureBase64: sign(null, reviewSignatureBytes(payload), privateKey).toString('base64')};
  const trust = {keys: [{keyId: envelope.keyId, publicKeyPem: publicKey.export({type: 'spki', format: 'pem'}), reviewerReference: payload.reviewerReference,
    roles: ['transport-test-only'], authorizationReference: 'unit-test transport only; no reviewer authorization', independenceConfirmed: true, revoked: false}]};
  const now = Date.parse('2026-11-16T10:00:00Z');
  assert.equal(verifyReviewSignature(envelope, trust, 'transport-test-only', now), true);
  assert.equal(verifyReviewSignature(envelope, trust, 'botanical-review', now), false);
  assert.equal(verifyReviewSignature({...envelope, payload: {...payload, kind: 'modified'}}, trust, 'transport-test-only', now), false);
  assert.equal(verifyReviewSignature(envelope, trust, 'transport-test-only', Date.parse(payload.expiresAt)), false);
  assert.equal(verifyReviewSignature(envelope, {keys: []}, 'transport-test-only', now), false);
  assert.equal(verifyReviewSignature(envelope, {keys: [{...trust.keys[0], revoked: true}]}, 'transport-test-only', now), false);
  assert.equal(verifyReviewSignature(envelope, {keys: [{...trust.keys[0], roles: 'transport-test-only'}]}, 'transport-test-only', now), false);
  const scopedPayload = {...payload, scopeRoutes: ['diagnosis']};
  const scopedEnvelope = {...envelope, payload: scopedPayload, signatureBase64: sign(null, reviewSignatureBytes(scopedPayload), privateKey).toString('base64')};
  assert.equal(verifyReviewSignature(scopedEnvelope, {keys: [{...trust.keys[0], roles: ['botanical-review'], scopeRoutes: ['care_refresh']}]}, 'botanical-review', now), false);
});
test('sixty invented complete grades and an arbitrary approval hash cannot approve the legacy helper', () => {
  const oldDimensions = ['identification', 'visibleSymptoms', 'differential', 'uncertainty', 'treatmentSafety', 'usefulness', 'hallucination', 'language', 'structuredValidity', 'conciseness'];
  const scores = Object.fromEntries(oldDimensions.map(key => [key, 1]));
  const forged = {...policy, botanicalReview: {status: 'independently_reviewed', reviewerReference: 'UNTRUSTED NEGATIVE-TEST CLAIM', approvalSha256: 'a'.repeat(64)}, botanicalMinimums: scores};
  const rows = Array.from({length: 60}, (_, i) => ({...untrustedClaim(), independentCaseGroup: 'untrusted_' + i, language: ['en', 'sk', 'de', 'fr', 'es'][i % 5], scores}));
  assert.equal(qualifyModelRoute(forged, rows).activationAllowed, false);
});
test('zero accepted or unreviewed results have undefined acceptable-result cost', () => {
  assert.equal(costPerAcceptableResult(.25, 0, true), null);
  assert.equal(costPerAcceptableResult(.25, 5, false), null);
  assert.equal(costPerAcceptableResult(.25, 5, true), .05); // Arithmetic only, not an approval fixture.
  assert.throws(() => costPerAcceptableResult(-1, 5, true));
});
test('malformed or missing inventories are rejected without qualification', () => {
  assert.equal(validateSignedReview().activationAllowed, false);
  assert.ok(validateSignedReview({...input(), inventory: [null]}).errors.includes('MISSING_OR_INVALID_INVENTORY'));
  assert.ok(validateReviewRows([], null, rubric).errors.includes('INVALID_REVIEW_INVENTORY'));
});
test('import cannot accept submission-nominated trust, clock overrides or overwrite evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'plantie-negative-review-'));
  try {
    const source = join(root, 'input.json'), trust = join(root, 'trust.json'), output = join(root, 'output.json');
    writeFileSync(trust, JSON.stringify({keys: []}));
    for (const change of [{trust: {}}, {trustFile: trust}, {now: 1}]) { writeFileSync(source, JSON.stringify({...input(), ...change})); assert.throws(() => importModelReview(source, trust, output)); }
    const value = input(); delete value.trust; delete value.now; writeFileSync(source, JSON.stringify(value));
    assert.equal(importModelReview(source, trust, output).activationAllowed, false);
    assert.throws(() => importModelReview(source, trust, output), /EEXIST/);
  } finally { rmSync(root, {recursive: true, force: true}); }
});
test('actual v1 schemas check enums, types, bounds, content, envelope and explicit intervals', async () => {
  const bundled = await build({stdin: {resolveDir: process.cwd(), loader: 'ts', contents: 'export * from "./supabase/functions/_shared/plantCareContract.ts";export * from "./supabase/functions/_shared/plantDiagnosisContract.ts";'}, bundle: true, write: false, format: 'esm'});
  const api = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
  assert.equal(analyzeReviewResponse({care: syntheticCare}, 'care_refresh', 'en', api).structuralStatus, 'PASS');
  for (const change of [{wateringIntervalDays: 1}, {wateringIntervalDays: '7'}, {identificationConfidence: 'certain'}, {displayName: ''}, {unexpected: true}]) assert.equal(analyzeReviewResponse({care: {...syntheticCare, ...change}}, 'care_refresh', 'en', api).structuralStatus, 'FAIL');
  const conflicting = analyzeReviewResponse({care: {...syntheticCare, watering: 'Water every 10 days', wateringIntervalDays: 7}}, 'care_refresh', 'en', api);
  assert.equal(conflicting.wateringIntervalIndicator, 'EXPLICIT_INTERVAL_MISMATCH_REQUIRES_CONTEXT_REVIEW');
  assert.equal(conflicting.botanicalReview, 'UNREVIEWED'); assert.equal(conflicting.treatmentSafety, 'NOT VERIFIED');
  assert.equal(analyzeReviewResponse(null, 'diagnosis', 'en', api).structuralStatus, 'FAIL');
});
