import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';import {resolve,join} from 'node:path';import {randomBytes} from 'node:crypto';
import {makeBlindedReview,renderBlindedReview,reviewSha} from './lib/modelReviewPackage.mjs';
const [results,assets,destination]=process.argv.slice(2);if(!results||!assets||!destination)throw Error('Usage: node scripts/prepare-model-review.mjs <synthetic-results.json> <approved-corpus-directory> <new-output-directory>');
const output=resolve(destination),mapping=output+'.operator-map.json';if(existsSync(output)||existsSync(mapping))throw Error('Use a new review output path;never overwrite scored evidence');
const bytes=readFileSync(results);if(bytes.length>16*1024*1024)throw Error('Review input too large');
const source=JSON.parse(bytes),corpus=JSON.parse(readFileSync('tests/fixtures/botanical-model-corpus.json','utf8'));
const review=makeBlindedReview({corpus,experiments:source.experiments,seed:randomBytes(32),sourceSha256:reviewSha(bytes)});
const files=new Map();for(const context of review.manifest.contexts){const file=resolve(assets,context.caseId+'.jpg'),data=readFileSync(file);if(data.length>2097152||reviewSha(data)!==context.imageSha256)throw Error('Approved original image mismatch');files.set(context.image,data);}
mkdirSync(join(output,'assets'),{recursive:true});for(const[file,data]of files)writeFileSync(join(output,file),data,{flag:'wx'});
for(const[name,value]of [['manifest.json',review.manifest],['scores.json',review.scores]])writeFileSync(join(output,name),JSON.stringify(value,null,2),{flag:'wx'});
writeFileSync(join(output,'index.html'),renderBlindedReview(review.manifest),{flag:'wx'});writeFileSync(mapping,JSON.stringify(review.operatorMapping,null,2),{flag:'wx'});
console.log(JSON.stringify({reviewDirectory:output,contexts:review.manifest.contexts.length,anonymizedResponses:review.scores.length,originalImages:files.size,mappingStoredOutsidePackage:true,reviewStatus:'UNREVIEWED'}));
