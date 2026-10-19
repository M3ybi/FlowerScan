import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const bundle = await build({ entryPoints: ["supabase/functions/_shared/observability.ts"], bundle:true,write:false,format:"esm",platform:"node",logLevel:"silent" });
const { observeOperation } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

test("operation correlation preserves responses and excludes private request/provider material", async () => {
  const events=[];
  const response=await observeOperation("image_upload",async()=>Response.json({value:"private-response"}),{emit:event=>events.push(event)})(new Request("https://fixture.invalid/?invite=private-token",{headers:{Authorization:"Bearer private-jwt"}}));
  assert.deepEqual(await response.json(),{value:"private-response"});
  assert.equal(events[0].requestId,response.headers.get("X-Plantie-Request-ID"));
  assert.equal(events[0].outcome,"success"); assert.doesNotMatch(JSON.stringify(events),/private|Authorization|fixture/);
  assert.deepEqual(Object.keys(events[0]).sort(),["durationMs","event","operation","outcome","requestId","status"].sort());
});
test("unhandled operations fail safely and logging failure cannot undo a completed write", async () => {
  const request=new Request("https://fixture.invalid");
  const response=await observeOperation("deletion_review",async()=>{throw new Error("private provider body");},{emit(){}})(request);
  assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/private provider/);
  const success=await observeOperation("deletion_review",async()=>Response.json({saved:true},{status:202}),{emit(){throw new Error("log unavailable");}})(request);
  assert.equal(success.status,202);
});
test("parallel operations have independent correlation and classify throttling separately", async () => {
  const events=[];
  const handler=observeOperation("plant_diagnosis",async()=>Response.json({}, {status:429}),{emit:event=>events.push(event)});
  const responses=await Promise.all(Array.from({length:40},()=>handler(new Request("https://fixture.invalid"))));
  assert.equal(new Set(responses.map(response=>response.headers.get("X-Plantie-Request-ID"))).size,40);
  assert.ok(events.every(event=>event.outcome==="throttled"&&event.status===429));
});
