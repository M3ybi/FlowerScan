import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateSignedReview, reviewEvidenceHash} from './lib/modelReviewEvidence.mjs';

export const importModelReview = (inputFile, trustFile, outputFile) => {
  const bytes = readFileSync(inputFile);
  if (bytes.length > 16 * 1024 * 1024) throw Error('Bounded review import exceeded');
  const input = JSON.parse(bytes);
  // The operator supplies an independently pinned local trust registry. A
  // submission must never be able to nominate its own trusted signing keys.
  if (['trust', 'trustFile', 'now'].some(key => Object.hasOwn(input, key))) throw Error('Submission cannot nominate trust or clock overrides');
  const trustBytes = readFileSync(trustFile);
  if (trustBytes.length > 1024 * 1024) throw Error('Bounded trust registry exceeded');
  const result = validateSignedReview({...input, trust: JSON.parse(trustBytes), now: Date.now()});
  const report = {...result, sourceSha256: reviewEvidenceHash(input), trustSha256: reviewEvidenceHash(JSON.parse(trustBytes)), paidProviderAttempts: 0};
  writeFileSync(outputFile, JSON.stringify(report, null, 2), {flag: 'wx'});
  return report;
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [inputFile, trustFile, outputFile] = process.argv.slice(2);
  if (!inputFile || !trustFile || !outputFile) throw Error('Usage: node scripts/import-model-review.mjs <submission-input.json> <operator-trust.json> <new-report.json>');
  const result = importModelReview(inputFile, trustFile, outputFile);
  console.log(JSON.stringify({status: result.status, errors: result.errors, activationAllowed: false, paidProviderAttempts: 0}));
  if (result.status !== 'SIGNED REVIEW IMPORTED') process.exitCode = 2;
}
