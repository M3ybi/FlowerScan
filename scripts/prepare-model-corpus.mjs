import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {validateModelCase,summarizeModelCorpus} from './lib/modelEvaluation.mjs';
const cases=JSON.parse(await readFile('tests/fixtures/botanical-model-corpus.json','utf8'));
const destination=resolve(process.argv[2]??'.tmp-evaluation-corpus');await mkdir(destination,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const item of cases){
 validateModelCase(item);const file=join(destination,item.id+'.jpg');let bytes;
 try{bytes=await readFile(file);}catch(error){if(error.code!=='ENOENT')throw error;}
 if(!bytes){
  if(item.sourceUrl){
   const url=new URL(item.sourceUrl);assert.equal(url.origin,'https://raw.githubusercontent.com');assert.equal(url.search+url.hash+url.username+url.password,'');
   assert.ok(url.pathname.startsWith('/spMohanty/PlantVillage-Dataset/7f7ecc7e1eaca78107e3affe7cb5abd9427e139a/raw/color/'));
   const response=await fetch(url,{signal:AbortSignal.timeout(20000)});assert.equal(response.status,200);
   const reader=response.body.getReader(),parts=[];let size=0;
   try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>2097152){await reader.cancel();throw Error('Corpus image exceeds approved byte limit');}parts.push(value);}}finally{reader.releaseLock();}
   bytes=Buffer.concat(parts);
  }else{assert.ok(item.image.startsWith('FlowersImg/')&&!item.image.slice(11).includes('/'));bytes=await readFile(item.image);}
  assert.equal(sha(bytes),item.imageSha256,`Pinned corpus bytes differ for ${item.id}`);await writeFile(file,bytes,{flag:'wx'});
 }
 assert.equal(sha(bytes),item.imageSha256);assert.ok(bytes.length<=2097152&&bytes[0]===255&&bytes[1]===216);
}
const attribution=['# Evaluation image attribution','','PlantVillage subset: Mohanty, Hughes and Salathé (2016), DOI 10.3389/fpls.2016.01419. Images are CC BY-SA 3.0: https://creativecommons.org/licenses/by-sa/3.0/ . Publisher license record: https://huggingface.co/datasets/mohanty/PlantVillage . Original bytes are unchanged. Preserve attribution/license on redistribution.','','PlantieCare catalog photographs are user-authorized existing project material for this evaluation; no new public redistribution license is asserted.','',...cases.map(c=>`${c.id}: ${c.sourceUrl??c.image} ; SHA-256 ${c.imageSha256}`)].join('\n');
await writeFile(join(destination,'ATTRIBUTION.md'),attribution+'\n');console.log(JSON.stringify({...summarizeModelCorpus(cases),destination}));
