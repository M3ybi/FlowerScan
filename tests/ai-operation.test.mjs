import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { aiEdgeHandler, syntheticCare, syntheticUsage, productionTestBinding } from "./fixtures/aiEdgeHarness.mjs";

const actor = "11111111-1111-4111-8111-111111111111";
const household = "22222222-2222-4222-8222-222222222222";
const bundle = await build({ entryPoints: ["tests/fixtures/imagePayload.ts"], bundle: true, write: false, format: "esm" });
const { fixtureDataUrl } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const clientBundle = await build({ entryPoints: ["src/lib/imageUploadErrors.ts"], bundle: true, write: false, format: "esm" });
const clientErrors = await import(`data:text/javascript;base64,${Buffer.from(clientBundle.outputFiles[0].text).toString("base64")}`);
const body = { householdId: household, plantName: "Synthetic", imageDataUrl: fixtureDataUrl(), language: "en" };
const provider = () => Response.json({ model: "gpt-6-luna", service_tier: "default", status: "completed", usage: syntheticUsage, output_text: JSON.stringify(syntheticCare) });
const setup = async ({ claim = { decision: "RUN", operationId: actor, leaseId: actor, ...productionTestBinding() }, failAt, fetch = async () => provider(), settlementState = "COMPLETED", signedIn = true } = {}) => {
  const calls = [], facts = []; let providerCalls = 0;
  const invoke = await aiEdgeHandler("plant-care-ai", { actorId: actor, signedIn,
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === failAt) throw new Error("Synthetic database unavailable; sensitive internal text must not escape");
      if (name === "ai_claim_image_operation") return claim;
      if (name === "ai_start_image_attempt") return household;
      if (name === "ai_finish_attempt") { facts.push(args); return { state: settlementState }; }
      throw new Error("Unexpected RPC");
    },
    fetch: async (...args) => { providerCalls++; return fetch(...args); },
  });
  return { invoke, calls, facts, count: () => providerCalls };
};

test("unknown/null/empty generation sources fail before database or inference; omitted source supports old clients", async () => {
  const h = await setup();
  for (const generationSource of ["unknown", "", null, false, [], {}]) assert.equal((await h.invoke({ ...body, generationSource })).status, 400);
  assert.equal(h.calls.length, 0);
  assert.equal((await h.invoke(body)).status, 200);
  assert.equal(h.calls[0].args.kind, "initial_care");
  assert.equal(h.count(), 1);
});

test("unauthenticated and malformed retry identities never initiate inference", async () => {
  const anon = await setup({ signedIn: false });
  assert.equal((await anon.invoke(body)).status, 401); assert.equal(anon.calls.length, 0);
  const h = await setup();
  for (const operationKey of ["../escape", "a".repeat(101), null, 123, {}]) assert.equal((await h.invoke({ ...body, operationKey })).status, 400);
  assert.equal(h.count(), 0); assert.equal(h.calls.length, 0);
});

test("actor, fingerprint, model, image metadata and retry fallback are server-derived", async () => {
  const h = await setup({ fetch: async (_url, init) => {
    const request = JSON.parse(init.body);
    assert.equal(request.model, "gpt-6-luna"); assert.equal(request.service_tier, "default"); assert.equal(request.store, false);
    return provider();
  } });
  assert.equal((await h.invoke({ ...body, userId: household, model: "arbitrary-model", cost: 0, operationId: household })).status, 200);
  const args = h.calls[0].args;
  assert.equal(args.actor, actor); assert.equal(args.household, household); assert.match(args.request_fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(args.retry_key, `legacy:${args.request_fingerprint}`); assert.equal(args.model_name, "gpt-6-luna");
  const ledger = JSON.stringify(h.facts[0].facts);
  assert.equal(ledger.includes("data:image"), false); assert.equal(ledger.includes("Synthetic"), false);
  assert.deepEqual(h.facts[0].facts.usage, syntheticUsage);
});

test("completed result replay and processing/terminal responses never call provider", async () => {
  for (const [claim, status] of [[{ decision: "REPLAY", result: { care: syntheticCare } }, 200], [{ decision: "WAIT" }, 409], [{ decision: "STOP", state: "UNKNOWN" }, 503]]) {
    const h = await setup({ claim }); assert.equal((await h.invoke(body)).status, status); assert.equal(h.count(), 0);
    assert.equal(h.calls.length, 1);
  }
});

test("new operation errors follow all five selected application languages", async () => {
  for (const [language, phrase] of [["en","processing"],["sk","spracúva"],["de","verarbeitet"],["fr","cours"],["es","procesándose"]]) {
    const h = await setup({ claim: { decision: "WAIT" } });
    const response = await h.invoke({ ...body, language });
    assert.equal(response.status,409); assert.match((await response.json()).error,new RegExp(phrase));
  }
});

test("existing client image-error handling preserves actionable operation errors in every language", async () => {
  for (const language of ["en","sk","de","fr","es"]) {
    const error = await clientErrors.imageErrorFromResponse({ context: Response.json({ code: "AI_PENDING_PLANTS", error: "Ignored provider detail" },{ status:429 }) });
    assert.equal(error.code,"AI_PENDING_PLANTS"); assert.equal(error.status,429);
    const message = clientErrors.imageErrorMessage(error,language);
    assert.match(message,/24/); assert.equal(message.includes("Ignored provider"),false);
  }
});

test("database failure before claim/start fails closed with no provider spend or raw error leakage", async () => {
  for (const failAt of ["ai_claim_image_operation", "ai_start_image_attempt"]) {
    const h = await setup({ failAt }); const response = await h.invoke(body);
    assert.equal(response.status, 503); assert.equal(h.count(), 0); assert.equal((await response.text()).includes("sensitive"), false);
  }
});

test("settlement failure retries accounting twice and never repeats inference", async () => {
  const h = await setup({ failAt: "ai_finish_attempt" });
  assert.equal((await h.invoke(body)).status, 503); assert.equal(h.count(), 1);
  assert.equal(h.calls.filter(call => call.name === "ai_finish_attempt").length, 2);
});

test("provider network/timeout and malformed transport settle uncertainty rather than invent zero usage", async () => {
  for (const fetch of [async () => { throw new TypeError("Network boundary failed"); }, async () => { throw new DOMException("Timed out", "TimeoutError"); }, async () => new Response("not JSON")]) {
    const h = await setup({ fetch }); const response = await h.invoke(body);
    assert.ok([502, 504].includes(response.status)); assert.equal(h.count(), 1); assert.equal(h.facts.length, 1);
    assert.equal(h.facts[0].outcome, "UNKNOWN"); assert.equal(h.facts[0].facts.usage, undefined);
    assert.equal("costUsd" in h.facts[0].facts, false);
  }
});

test("incomplete/refused/invalid successful responses preserve reported financial usage without customer success", async () => {
  for (const response of [
    { status: "incomplete", output_text: JSON.stringify(syntheticCare) },
    { status: "failed" }, { status: "cancelled" }, { status: "completed", output: [{ content: [{ type: "refusal", refusal: "Synthetic refusal" }] }] },
    { status: "completed", output_text: JSON.stringify({ ...syntheticCare, careTips: [] }) },
  ]) {
    const h = await setup({ fetch: async () => Response.json({ ...response, model: "gpt-6-luna", service_tier: "default", usage: syntheticUsage }) });
    assert.ok((await h.invoke(body)).status >= 500); assert.equal(h.facts.length, 1);
    assert.equal(h.facts[0].outcome, "FAILED"); assert.deepEqual(h.facts[0].facts.usage, syntheticUsage);
  }
});

test("unsuccessful provider HTTP responses still record usage; invalid-image classification is preserved", async () => {
  const h = await setup({ fetch: async () => Response.json({ error: { code: "invalid_image" }, usage: syntheticUsage, model: "gpt-6-luna", service_tier: "default" }, { status: 400 }) });
  assert.equal((await h.invoke(body)).status, 400); assert.equal(h.facts[0].outcome, "FAILED");
  assert.deepEqual(h.facts[0].facts.usage, syntheticUsage); assert.equal(h.facts[0].facts.httpStatus, 400);
});

test("authorization/settlement loss cannot return a successful generated response", async () => {
  const h = await setup({ settlementState: "FAILED" }); assert.equal((await h.invoke(body)).status, 503);
  assert.equal(h.count(), 1);
});

test("response reading is bounded and an oversized provider body is accounted as uncertain", async () => {
  const h = await setup({ fetch: async () => new Response("x".repeat(131073)) });
  assert.equal((await h.invoke(body)).status, 502); assert.equal(h.facts[0].outcome, "UNKNOWN");
});
