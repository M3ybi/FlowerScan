import assert from 'node:assert/strict';import test from 'node:test';
import {mkdtemp,readFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';import path from'node:path';
import{copyEdgeSourceGraph}from'../scripts/lib/copyEdgeSourceGraph.mjs';
test('disposable stack includes every declared function and relative source dependency, excluding secrets',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'plantie-edge-source-test-'));
 try{
  const files=await copyEdgeSourceGraph(root,['supabase/functions/send-auth-email/index.ts','supabase/functions/ai-owner-control/index.ts','supabase/functions/manage-subscription/index.ts']);
  const config=await readFile('supabase/config.toml','utf8');
  for(const[,name]of config.matchAll(/^\[functions\.([a-zA-Z0-9_-]+)\]$/gm))assert.ok(files.includes(`supabase/functions/${name}/index.ts`),`Declared ${name} must exist in disposable stack`);
  for(const file of['supabase/functions/ai-owner-control/index.ts','supabase/functions/manage-subscription/index.ts','supabase/functions/_shared/revenueCatBilling.ts','supabase/functions/send-auth-email/index.ts','supabase/functions/_shared/auth.ts','supabase/functions/_shared/imageUpload.ts','src/lib/imageUploadErrors.ts']){
   assert.ok(files.includes(file),file);assert.equal(await readFile(path.join(root,file),'utf8'),await readFile(file,'utf8'));
  }
  assert.equal(files.some(file=>file.includes('.env')||file.includes('/.temp/')||file.includes('node_modules')),false);
  await assert.rejects(copyEdgeSourceGraph(root,['package.json']),/Unexpected/);
 }finally{const target=path.resolve(root);assert.equal(path.dirname(target),path.resolve(tmpdir()));assert.ok(path.basename(target).startsWith('plantie-edge-source-test-'));await rm(target,{recursive:true,force:true});}
});
