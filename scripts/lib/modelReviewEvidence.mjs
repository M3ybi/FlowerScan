import {createHash, createPublicKey, verify} from 'node:crypto';

export const reviewLanguages = Object.freeze(['en', 'sk', 'de', 'fr', 'es']);
export const reviewDimensions = Object.freeze(['identity', 'visibleSymptoms', 'differential', 'uncertainty', 'insufficientEvidence', 'hallucinationAvoidance', 'recommendationRelevance', 'treatmentSafety', 'environmentalConsistency', 'usefulness']);
export const criticalReviewFailures = Object.freeze(['unsupported_definitive_pathogen', 'dangerous_chemical', 'unsupported_destructive_treatment', 'serious_plant_damage', 'insufficient_evidence_ignored', 'unsupported_causal_certainty']);
const hashPattern = /^[a-f0-9]{64}$/;
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const validInventoryItem = item => item && nonempty(item.responseId) && item.responseId.length <= 128
  && nonempty(item.caseId) && hashPattern.test(item.responseSha256) && hashPattern.test(item.imageSha256)
  && ['initial_care', 'care_refresh', 'diagnosis'].includes(item.route) && reviewLanguages.includes(item.language);
export const canonicalReviewJson = value => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalReviewJson).join(',') + ']';
  if (value && Object.getPrototypeOf(value) === Object.prototype) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalReviewJson(value[key])).join(',') + '}';
  throw Error('Unsupported review JSON value');
};
export const reviewEvidenceHash = value => createHash('sha256').update(canonicalReviewJson(value)).digest('hex');
export const reviewSignatureBytes = payload => Buffer.from('PlantieCare-independent-review-v1\n' + canonicalReviewJson(payload));

// Keys are supplied by the operator, never read from the signed submission.
// A valid signature proves control of a pinned key, not botanical competence.
export const verifyReviewSignature = (envelope, trust, role, now = Date.now()) => {
  try {
    const {payload, keyId, signatureBase64} = envelope ?? {};
    if (!payload || !nonempty(payload.reviewerReference) || !nonempty(keyId) || !/^[A-Za-z0-9+/]{86}==$/.test(signatureBase64 ?? '')) return false;
    if (!Array.isArray(trust?.keys) || new Set(trust.keys.map(key => key.keyId)).size !== trust.keys.length) return false;
    const key = trust.keys.find(key => key.keyId === keyId);
    if (!key || key.revoked !== false || key.independenceConfirmed !== true || !nonempty(key.authorizationReference)
      || key.reviewerReference !== payload.reviewerReference || !Array.isArray(key.roles) || !key.roles.includes(role)) return false;
    if (role === 'botanical-review' || role === 'policy-approval' || role.startsWith('language:')) {
      if (!Array.isArray(key.scopeRoutes) || !Array.isArray(payload.scopeRoutes) || payload.scopeRoutes.length === 0
        || payload.scopeRoutes.some(route => !['initial_care', 'care_refresh', 'diagnosis'].includes(route) || !key.scopeRoutes.includes(route))) return false;
    }
    const issued = Date.parse(payload.issuedAt), expires = Date.parse(payload.expiresAt);
    if (!Number.isFinite(now) || !Number.isFinite(issued) || !Number.isFinite(expires) || issued > now || expires <= now || issued >= expires) return false;
    const publicKey = createPublicKey(key.publicKeyPem);
    return publicKey.asymmetricKeyType === 'ed25519' && verify(null, reviewSignatureBytes(payload), publicKey, Buffer.from(signatureBase64, 'base64'));
  } catch { return false; }
};

export const validateReviewRubric = rubric => {
  const errors = [];
  if (rubric?.version !== 'botanical-quality-rubric-v1' || rubric.scale?.join(',') !== '0,0.25,0.5,0.75,1'
    || rubric.unknownState !== 'NOT_REVIEWABLE') errors.push('INVALID_SCORING_RUBRIC');
  for (const dimension of reviewDimensions) if (!nonempty(rubric?.dimensions?.[dimension])) errors.push('INVALID_SCORING_RUBRIC');
  for (const score of ['0', '0.25', '0.5', '0.75', '1']) if (!nonempty(rubric?.anchors?.[score])) errors.push('INVALID_SCORING_RUBRIC');
  if (criticalReviewFailures.some(code => !nonempty(rubric?.criticalFailures?.[code]))) errors.push('INVALID_CRITICAL_FAILURE_RUBRIC');
  return [...new Set(errors)];
};

export const validateReviewRows = (rows, inventory, rubric) => {
  const errors = validateReviewRubric(rubric), entries = Array.isArray(inventory) ? inventory.filter(validInventoryItem) : [];
  if (!Array.isArray(inventory) || entries.length !== inventory.length) errors.push('INVALID_REVIEW_INVENTORY');
  const known = new Map(entries.map(item => [item.responseId, item]));
  const seen = new Set(), groups = new Map(), physicalImages = new Map();
  let complete = 0, notReviewable = 0;
  if (!Array.isArray(rows) || rows.length !== known.size || known.size === 0 || known.size !== entries.length) errors.push('INCOMPLETE_WORKSHEET');
  for (const row of Array.isArray(rows) ? rows : []) {
    const source = known.get(row?.responseId);
    if (!source || seen.has(row.responseId)) { errors.push('DUPLICATE_OR_UNKNOWN_RESPONSE'); continue; }
    seen.add(row.responseId);
    if (row.responseSha256 !== source.responseSha256 || row.imageSha256 !== source.imageSha256 || row.route !== source.route || row.language !== source.language) errors.push('REVIEW_SOURCE_MISMATCH');
    if (row.reviewStatus === 'NOT_REVIEWABLE') {
      notReviewable++;
      if (!nonempty(row.reason) || reviewDimensions.some(key => row.scores?.[key] !== null)) errors.push('INVALID_UNKNOWN_ASSESSMENT');
      continue;
    }
    if (row.reviewStatus !== 'independently_reviewed' || !nonempty(row.reviewerReference) || !nonempty(row.independentCaseGroup) || !nonempty(row.independenceEvidence)) errors.push('INCOMPLETE_INDEPENDENT_REVIEW');
    if (row.referenceIdentityStatus !== 'CONFIRMED' || !nonempty(row.referenceEvidence)) errors.push('UNKNOWN_REFERENCE_IDENTITY');
    if (reviewDimensions.some(key => !rubric?.scale?.includes(row.scores?.[key]))) errors.push('INVALID_OR_MISSING_SCORE');
    if (!nonempty(row.treatmentAssessment) || typeof row.criticalTreatmentRegression !== 'boolean' || !Array.isArray(row.criticalFailures)
      || row.criticalFailures?.some(code => !criticalReviewFailures.includes(code))) errors.push('EMPTY_OR_INVALID_TREATMENT_ASSESSMENT');
    if (row.criticalTreatmentRegression === true || row.criticalFailures?.length) errors.push('CRITICAL_TREATMENT_FAILURE');
    if (!nonempty(row.languageAssessment) || row.languageApproved !== true) errors.push('INVALID_LANGUAGE_ASSESSMENT');
    if (!reviewLanguages.includes(row.language)) errors.push('INVALID_LANGUAGE');
    if (nonempty(row.independentCaseGroup)) {
      const group = groups.get(row.independentCaseGroup) ?? new Set();
      // Repeated configurations/languages of one photo are not extra cases.
      const observation = source.caseId + ':' + source.imageSha256;
      group.add(observation); groups.set(row.independentCaseGroup, group);
      const previous = physicalImages.get(source.imageSha256);
      if (previous && previous !== row.independentCaseGroup) errors.push('DUPLICATE_PHOTO_SPLIT_INTO_GROUPS');
      physicalImages.set(source.imageSha256, row.independentCaseGroup);
    }
    complete++;
  }
  return {errors: [...new Set(errors)], completeRows: complete, notReviewableRows: notReviewable, claimedIndependentGroups: groups.size,
    independentlyVerified: false};
};

// This imports evidence only. It deliberately cannot issue a production
// activation approval or substitute for a separately signed route decision.
export const validateSignedReview = ({submission, policyApproval, policy, rubric, inventory: suppliedInventory, assessment, manifestSha256, archiveSha256, trust, languageReviews = [], now} = {}) => {
  const errors = [];
  const inventory = Array.isArray(suppliedInventory) ? suppliedInventory.filter(validInventoryItem) : [];
  if (!Array.isArray(suppliedInventory) || inventory.length !== suppliedInventory.length) errors.push('MISSING_OR_INVALID_INVENTORY');
  const payload = submission?.payload;
  if (!verifyReviewSignature(submission, trust, 'botanical-review', now)) errors.push('MISSING_OR_INVALID_REVIEW_SIGNATURE');
  if (!verifyReviewSignature(policyApproval, trust, 'policy-approval', now)) errors.push('MISSING_OR_INVALID_POLICY_SIGNATURE');
  if (payload?.kind !== 'worksheet-review' || payload?.claim !== 'REVIEWED') errors.push('UNSUPPORTED_QUALITY_CLAIM');
  if (!nonempty(payload?.approvalReference) || payload?.reviewScope !== 'WORKSHEET_ONLY' || !Array.isArray(payload?.scopeRoutes)
    || inventory.some(item => !payload.scopeRoutes.includes(item.route))) errors.push('MISSING_REVIEW_SCOPE_OR_REFERENCE');
  if (policyApproval?.payload?.decision !== 'APPROVED_THRESHOLDS' || !nonempty(policyApproval?.payload?.approvalReference)
    || !Array.isArray(policyApproval?.payload?.scopeRoutes) || inventory.some(item => !policyApproval.payload.scopeRoutes.includes(item.route))) errors.push('MISSING_POLICY_SCOPE_OR_REFERENCE');
  if (!hashPattern.test(manifestSha256 ?? '') || !hashPattern.test(archiveSha256 ?? '') || payload?.reviewManifestSha256 !== manifestSha256 || payload?.archiveSha256 !== archiveSha256) errors.push('REVIEW_MANIFEST_HASH_MISMATCH');
  if (reviewEvidenceHash(assessment ?? null) !== manifestSha256 || assessment?.archiveSha256 !== archiveSha256
    || assessment?.inventorySha256 !== reviewEvidenceHash(inventory)) errors.push('ASSESSMENT_OR_INVENTORY_HASH_MISMATCH');
  const policyHash = reviewEvidenceHash(policy ?? null), rubricHash = reviewEvidenceHash(rubric ?? null);
  if (payload?.policySha256 !== policyHash || payload?.rubricSha256 !== rubricHash || policyApproval?.payload?.kind !== 'policy-approval'
    || policyApproval?.payload?.policySha256 !== policyHash || policyApproval?.payload?.rubricSha256 !== rubricHash) errors.push('POLICY_OR_RUBRIC_HASH_MISMATCH');
  if (!Number.isInteger(policy?.minimumIndependentCases) || policy.minimumIndependentCases < 60) errors.push('INVALID_CASE_MINIMUM');
  if (!Number.isFinite(policy?.nonInferiorityMargin) || policy.nonInferiorityMargin <= 0 || policy.nonInferiorityMargin > .1) errors.push('MISSING_OR_INVALID_NONINFERIORITY_MARGIN');
  if (reviewDimensions.some(key => !Number.isFinite(policy?.minimums?.[key]) || policy.minimums[key] < 0 || policy.minimums[key] > 1)) errors.push('INVALID_THRESHOLD_MINIMUMS');
  const rows = validateReviewRows(payload?.rows, inventory, rubric); errors.push(...rows.errors);
  if (Array.isArray(payload?.rows) && payload.rows.some(row => row.reviewStatus === 'independently_reviewed' && row.reviewerReference !== payload.reviewerReference)) errors.push('REVIEWER_IDENTITY_MISMATCH');
  const rowSetHash = reviewEvidenceHash(payload?.rows ?? []);
  for (const language of reviewLanguages) {
    const approval = languageReviews.filter(item => item?.payload?.language === language);
    if (approval.length !== 1 || !verifyReviewSignature(approval[0], trust, 'language:' + language, now)
      || approval[0]?.payload?.kind !== 'language-review' || approval[0]?.payload?.approved !== true
      || approval[0]?.payload?.rowsSha256 !== rowSetHash || approval[0]?.payload?.reviewManifestSha256 !== manifestSha256
      || approval[0]?.payload?.archiveSha256 !== archiveSha256 || approval[0]?.payload?.rubricSha256 !== rubricHash
      || !Array.isArray(approval[0]?.payload?.scopeRoutes) || inventory.some(item => !approval[0].payload.scopeRoutes.includes(item.route))
      || !nonempty(approval[0]?.payload?.assessmentReference)) errors.push('MISSING_OR_INVALID_LANGUAGE_APPROVAL');
  }
  return {status: errors.length ? 'NOT VERIFIED' : 'SIGNED REVIEW IMPORTED', errors: [...new Set(errors)],
    independentReviewedCases: errors.length ? 0 : rows.claimedIndependentGroups,
    reviewedOutputs: errors.length ? 0 : rows.completeRows, notReviewableOutputs: rows.notReviewableRows,
    minimumCoverageMet: !errors.length && rows.claimedIndependentGroups >= policy.minimumIndependentCases,
    qualification: 'BLOCKED', activationAllowed: false,
    limitation: 'Signed worksheet import is not a route qualification or rollout approval. Independent category coverage, approved paired non-inferiority analysis, safety, immutable configuration and separate operator approval are still required.'};
};

export const costPerAcceptableResult = (totalCostUsd, acceptableResults, independentlyApproved) => {
  if (typeof totalCostUsd !== 'number' || !Number.isFinite(totalCostUsd) || totalCostUsd < 0 || !Number.isInteger(acceptableResults) || acceptableResults < 0) throw Error('Invalid cost sample');
  return independentlyApproved === true && acceptableResults > 0 ? totalCostUsd / acceptableResults : null;
};

export const validateReviewJson = (value, schema, location = '$') => {
  const errors = [];
  if (schema.enum && !schema.enum.includes(value)) errors.push(location + ':enum');
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [location + ':object'];
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) errors.push(location + '.' + key + ':missing');
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties, key)) { if (schema.additionalProperties === false) errors.push(location + '.' + key + ':unsupported'); }
      else errors.push(...validateReviewJson(value[key], schema.properties[key], location + '.' + key));
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) errors.push(location + ':array');
    else value.forEach((item, index) => errors.push(...validateReviewJson(item, schema.items, location + '[' + index + ']')));
  } else if (schema.type === 'string') {
    if (typeof value !== 'string' || !value.trim()) errors.push(location + ':empty-or-nonstring');
  } else if (schema.type === 'integer' && (!Number.isInteger(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) errors.push(location + ':integer-bounds');
  return errors;
};

const languageWords = {
  en: ['the', 'and', 'water', 'leaves', 'soil', 'plant', 'avoid', 'light', 'when', 'check'],
  sk: ['a', 'ale', 'rastliny', 'listy', 'pôdy', 'substrát', 'zálievku', 'svetlo', 'pri', 'ak'],
  de: ['die', 'und', 'der', 'nicht', 'bei', 'blätter', 'pflanze', 'erde', 'wasser', 'licht'],
  fr: ['les', 'des', 'et', 'le', 'la', 'feuilles', 'arrosage', 'plante', 'lumière', 'pas'],
  es: ['las', 'los', 'y', 'de', 'hojas', 'riego', 'planta', 'sustrato', 'agua', 'luz'],
};
export const analyzeReviewResponse = (response, route, language, contracts) => {
  const kind = route === 'diagnosis' ? 'diagnosis' : 'care', value = response?.[kind], bytes = Buffer.byteLength(JSON.stringify(response) ?? 'null');
  const structuralErrors = !response || Object.keys(response).length !== 1 || !value ? ['INVALID_RESPONSE_ENVELOPE'] : validateReviewJson(value, contracts[kind + 'Schema']);
  if (bytes > 65536) structuralErrors.push('OUTPUT_SIZE_LIMIT');
  let normalized;
  try { normalized = contracts[kind === 'care' ? 'parseCare' : 'parseDiagnosis'](JSON.stringify(value)); } catch { normalized = null; }
  if (!normalized || canonicalReviewJson(normalized) !== canonicalReviewJson(value)) structuralErrors.push('BUSINESS_CONTRACT_OR_NORMALIZATION_MISMATCH');
  const strings = item => typeof item === 'string' ? [item] : Array.isArray(item) ? item.flatMap(strings) : item && typeof item === 'object' ? Object.entries(item).filter(([key]) => !['tone', 'identificationConfidence', 'risk_level', 'confidence_label'].includes(key)).flatMap(([, child]) => strings(child)) : [];
  const text = strings(value).join(' '), words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  const languageHits = Object.fromEntries(reviewLanguages.map(code => [code, words.filter(word => languageWords[code].includes(word)).length]));
  const leadingLanguage = reviewLanguages.reduce((best, code) => languageHits[code] > languageHits[best] ? code : best, language);
  const explicitIntervals = [...(value?.watering ?? '').matchAll(/(?:every|alle|tous les|cada|každ(?:é|ých))\s+(\d{1,2})(?:\s*[–-]\s*(\d{1,2}))?\s*(?:days?|tage[n]?|jours?|días?|dní)/giu)].map(match => ({min: Number(match[1]), max: Number(match[2] ?? match[1])}));
  return {structuralStatus: structuralErrors.length ? 'FAIL' : 'PASS', structuralErrors, bytes,
    languageIndicator: leadingLanguage !== language && languageHits[leadingLanguage] >= 3 ? 'POSSIBLE_WRONG_LANGUAGE' : 'NO_INDICATOR', languageHits,
    wateringIntervalIndicator: explicitIntervals.some(interval => value.wateringIntervalDays < interval.min || value.wateringIntervalDays > interval.max) ? 'EXPLICIT_INTERVAL_MISMATCH_REQUIRES_CONTEXT_REVIEW' : 'NO_INDICATOR', explicitIntervals,
    reviewIndicators: [
      [/bleach|fungicid|pesticid|bielidl|javel|lej[ií]a|chlor/iu, 'CHEMICAL_CONTEXT'],
      [/repot|root.{0,20}prun|presad|rempot|trasplant|umtopf|fertili|hnoj|düng|engrais/iu, 'ROOT_REPOTTING_OR_FEEDING_CONTEXT'],
      [/root rot|pourriture|wurz|ra[ií]ces|kore[nň]|mites|acari|rozto/iu, 'ROOT_OR_PEST_CLAIM_CONTEXT'],
    ].filter(([pattern]) => pattern.test(text)).map(([, code]) => code),
    botanicalReview: 'UNREVIEWED', treatmentSafety: 'NOT VERIFIED', multilingualQuality: 'NOT VERIFIED'};
};
