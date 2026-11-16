import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { build } from "esbuild";

const bundle = await build({ entryPoints: ["supabase/functions/_shared/revenueCatBilling.ts"], bundle: true, write: false, format: "iife", globalName: "BillingFixture" });
const context = { AbortSignal, URL, URLSearchParams, fetch };
vm.runInNewContext(bundle.outputFiles[0].text, context);
const { createRevenueCatBillingClient } = context.BillingFixture;
const source = { id: "sub_fixture", customer_id: "hh_fixture", original_customer_id: "hh_fixture", store: "rc_billing", environment: "sandbox", auto_renewal_status: "will_renew" };
const json = value => new Response(JSON.stringify(value), { status: 200 });
const fixture = ({ patch = {}, lostResponse = false, errorStatus = 0 } = {}) => {
  let subscription = { ...source, ...patch };
  const requests = [];
  const client = createRevenueCatBillingClient({ apiKey: "fixture_secret", projectId: "proj_fixture", environment: "sandbox", fetch: async (url, options) => {
    requests.push({ url, method: options.method });
    assert.equal(options.headers.Authorization, "Bearer fixture_secret");
    assert.equal(options.redirect, "error");
    if (errorStatus) return new Response("private provider message", { status: errorStatus });
    if (url.includes("/actions/cancel")) {
      subscription.auto_renewal_status = "will_not_renew";
      if (lostResponse) throw new Error("private network failure");
      return json(subscription);
    }
    if (url.includes("authenticated_management_url")) return json({ management_url: "https://billing.revenuecat.com/fixture?token=private" });
    if (url.includes("/subscriptions?")) return json({ items: [subscription], next_page: null });
    return json(subscription);
  } });
  return { client, requests };
};

test("provider cancellation is renewal-only, reauthorized and idempotent", async () => {
  const { client, requests } = fixture();
  let authorizations = 0;
  await client.cancel("hh_fixture", "original_transaction", async () => { authorizations++; });
  await client.cancel("hh_fixture", "original_transaction", async () => { authorizations++; });
  assert.equal(authorizations, 2);
  assert.equal(requests.filter(r => r.method === "POST").length, 1);
  assert(requests.filter(r => r.method === "POST").every(r => r.url.endsWith("/actions/cancel")));
  assert(requests[0].url.includes("store_subscription_identifier=original_transaction"));
});

test("lost cancellation response never auto-retries; next request reconciles authoritative state", async () => {
  const { client, requests } = fixture({ lostResponse: true });
  await assert.rejects(client.cancel("hh_fixture", "original_transaction", async () => {}), /could not be confirmed/);
  await client.cancel("hh_fixture", "original_transaction", async () => {});
  assert.equal(requests.filter(r => r.method === "POST").length, 1);
});

test("foreign customer, transferred customer, wrong environment, unsupported store and unknown renewal fail closed", async () => {
  for (const patch of [{ customer_id: "other" }, { customer_id: "other", original_customer_id: "hh_fixture" }, { environment: "production" }, { store: "app_store" }, { store: "test_store" }, { auto_renewal_status: "unknown" }]) {
    const { client, requests } = fixture({ patch });
    await assert.rejects(client.cancel("hh_fixture", "original_transaction", async () => {}));
    assert.equal(requests.filter(r => r.method === "POST").length, 0);
  }
});

test("provider failure and lost authorization never mutate subscriptions or expose provider details", async () => {
  for (const errorStatus of [400, 401, 403, 409, 429, 500]) {
    const { client, requests } = fixture({ errorStatus });
    await assert.rejects(client.cancel("hh_fixture", "original_transaction", async () => {}), error => !error.message.includes("private") && error.status === 503);
    assert.equal(requests.filter(r => r.method === "POST").length, 0);
  }
  const { client, requests } = fixture();
  await assert.rejects(client.cancel("hh_fixture", "original_transaction", async () => { throw new Error("Authorization changed"); }));
  assert.equal(requests.filter(r => r.method === "POST").length, 0);
});

test("management recovery returns provider URL without another checkout or mutation", async () => {
  const { client, requests } = fixture();
  assert.equal(await client.managementUrl("hh_fixture", "original_transaction"), "https://billing.revenuecat.com/fixture?token=private");
  assert(requests.every(r => r.method === "GET"));
});

test("pagination never follows arbitrary URLs and an ambiguous source cannot be cancelled", async () => {
  const requests = [];
  const client = createRevenueCatBillingClient({ apiKey: "fixture_secret", projectId: "proj_fixture", environment: "sandbox", fetch: async (url, options) => {
    requests.push(url); assert.equal(options.method, "GET");
    return requests.length === 1 ? json({ items: [source], next_page: "https://attacker.invalid/steal" })
      : json({ items: [{ ...source, id: "sub_second" }], next_page: null });
  } });
  await assert.rejects(client.cancel("hh_fixture", "original_transaction", async () => {}));
  assert.equal(requests.length, 2);
  assert(requests.every(url => new URL(url).origin === "https://api.revenuecat.com"));
});

test("malformed payloads, unsafe portal URLs and missing server configuration fail closed", async () => {
  assert.throws(() => createRevenueCatBillingClient({ apiKey: "", projectId: "proj_fixture", environment: "sandbox" }));
  for (const management_url of ["http://billing.revenuecat.com", "https://user:pass@billing.revenuecat.com", "javascript:alert(1)", null]) {
    const client = createRevenueCatBillingClient({ apiKey: "fixture_secret", projectId: "proj_fixture", environment: "sandbox", fetch: async url => url.includes("authenticated_management_url") ? json({ management_url }) : url.includes("/subscriptions?") ? json({ items: [source], next_page: null }) : json(source) });
    await assert.rejects(client.managementUrl("hh_fixture", "original_transaction"));
  }
});

const endpointBundle = await build({ entryPoints: ["supabase/functions/manage-subscription/index.ts"], bundle: true, write: false, format: "iife", plugins: [{
  name: "authenticated-provider-boundaries", setup(builder) {
    builder.onResolve({ filter: /\/auth\.ts$/ }, () => ({ path: "auth", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const requireUser=async()=>globalThis.endpointAuth; export const createServiceClient=()=>globalThis.serviceClient;" }));
  },
}] });
const household = "33333333-3333-4333-8333-333333333333";
const endpoint = ({ signedIn = true, viewer = false, revoke = false, changeBinding = false, configured = true } = {}) => {
  let handler, rpcCalls=0, reads=0, posts=0;
  let renewal = "will_renew";
  const env={REVENUECAT_BILLING_MODE:"web_sandbox",REVENUECAT_SECRET_API_KEY:configured?"fixture_secret":"",REVENUECAT_PROJECT_ID:"proj_fixture"};
  vm.runInNewContext(endpointBundle.outputFiles[0].text, {
    Deno:{serve:value=>{handler=value;},env:{get:key=>env[key]}},
    Response, Headers, AbortSignal, URL, URLSearchParams, TextDecoder,
    endpointAuth:signedIn?{user:{id:"verified-owner"},client:{rpc:async(name,args)=>{
      assert.equal(name,"get_household_billing_customer");assert.equal(args.target_household_id,household);rpcCalls++;
      return viewer||revoke&&rpcCalls>1?{error:{message:"private role detail"}}:{data:"hh_fixture",error:null};
    }}}:null,
    serviceClient:{from:table=>{
      assert.equal(table,"household_subscriptions");
      return{select:()=>({eq:(column,value)=>{
        assert.equal(column,"household_id");assert.equal(value,household);
        return{maybeSingle:async()=>{reads++;return{data:{provider_customer_id:"hh_fixture",provider_original_transaction_id:changeBinding&&reads>1?"new_transaction":"original_transaction"},error:null};}};
      }})};
    }},
    fetch:async(url,options)=>{
      if(options.method==='POST'){posts++;renewal='will_not_renew';}
      const value={...source,auto_renewal_status:renewal};
      return json(url.includes('/subscriptions?')?{items:[value],next_page:null}:value);
    },
  });
  return{invoke:body=>handler(new Request("https://fixture.invalid",{method:"POST",headers:{Authorization:"Bearer fixture"},body:JSON.stringify(body)})),counts:()=>({rpcCalls,reads,posts})};
};

test("actual endpoint denies unauthenticated and Viewer requests before provider or privileged reads", async () => {
  for(const [options,status]of[[{signedIn:false},401],[{viewer:true},403]]){
    const fixture=endpoint(options);const response=await fixture.invoke({householdId:household,action:"cancel"});
    assert.equal(response.status,status);assert.equal(fixture.counts().reads,0);assert.equal(fixture.counts().posts,0);
    assert.doesNotMatch(await response.text(),/fixture_secret|private role/);
  }
});

test("actual endpoint ignores forged provider identifiers and leaves entitlement persistence to the existing webhook", async () => {
  const fixture=endpoint();const response=await fixture.invoke({householdId:household,action:"cancel",customerId:"victim",subscriptionId:"victim",transactionId:"victim"});
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(await response.json(),{status:"cancelled",cancelAtPeriodEnd:true});
  assert.deepEqual(fixture.counts(),{rpcCalls:2,reads:2,posts:1});
});

test("actual endpoint rechecks authorization/binding and fails closed when server credentials are missing", async () => {
  for(const[options,status]of[[{revoke:true},403],[{changeBinding:true},409],[{configured:false},503]]){
    const fixture=endpoint(options);const response=await fixture.invoke({householdId:household,action:"cancel"});
    assert.equal(response.status,status);assert.equal(fixture.counts().posts,0);
    assert.doesNotMatch(await response.text(),/fixture_secret|private role/);
  }
});

test("actual endpoint rejects invalid household/action/oversize requests without any provider operation", async () => {
  for(const body of[{householdId:"not-a-uuid",action:"cancel"},{householdId:household,action:"refund"},{householdId:household,action:"cancel",extra:"x".repeat(2048)}]){
    const fixture=endpoint();const response=await fixture.invoke(body);assert.equal(response.status,400);
    assert.deepEqual(fixture.counts(),{rpcCalls:0,reads:0,posts:0});
  }
});
