import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { aiEdgeHandler, syntheticCare, syntheticUsage } from "./fixtures/aiEdgeHarness.mjs";

const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: "ts", contents: 'export * from "./supabase/functions/_shared/aiModelRegistry.ts"; export * from "./tests/fixtures/imagePayload.ts";' }, bundle: true, write: false, format: "esm" });
const api = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const actor = "11111111-1111-4111-8111-111111111111", household = "22222222-2222-4222-8222-222222222222";
const body = { householdId: household, plantName: "Synthetic", imageDataUrl: api.fixtureDataUrl(), language: "en" };

test("final runtime rejects a stale GPT-4o or Terra SQL binding before provider start", async () => {
  for (const model of ["gpt-4o", "gpt-6.1-terra"]) {
    const config = api.modelConfigurations.find(c => c.model === model && c.route === "initial_care");
    let providerCalls = 0, starts = 0;
    const invoke = await aiEdgeHandler("plant-care-ai", { actorId: actor,
      rpc: async name => {
        if (name === "ai_claim_image_operation") return { decision: "RUN", operationId: actor, leaseId: household, effectiveConfiguration: config.id, configurationHash: await api.modelConfigurationHash(config) };
        if (name === "ai_start_image_attempt") starts++;
        throw Error("No provider start permitted");
      }, fetch: async () => { providerCalls++; throw Error("No provider permitted"); },
    });
    assert.equal((await invoke(body)).status, 503);
    assert.equal(starts, 0); assert.equal(providerCalls, 0);
  }
});

test("qualified none and low each issue exactly one Luna request with their trusted configuration", async () => {
  for (const effort of ["none", "low"]) {
    const config = api.getLunaConfiguration("initial_care", effort); let providerCalls = 0;
    const invoke = await aiEdgeHandler("plant-care-ai", { actorId: actor,
      rpc: async name => {
        if (name === "ai_claim_image_operation") return { decision: "RUN", operationId: actor, leaseId: household, effectiveConfiguration: config.id, configurationHash: await api.modelConfigurationHash(config) };
        if (name === "ai_start_image_attempt") return actor;
        if (name === "ai_finish_attempt") return { state: "COMPLETED" };
        throw Error("Unexpected RPC");
      }, fetch: async (_url, init) => {
        providerCalls++; const request = JSON.parse(init.body);
        assert.equal(request.model, "gpt-6-luna"); assert.deepEqual(request.reasoning, { effort });
        assert.equal(request.max_output_tokens, 1400); assert.equal(request.store, false);
        return Response.json({ model: "gpt-6-luna", reasoning: { effort }, service_tier: "default", status: "completed", usage: syntheticUsage, output_text: JSON.stringify(syntheticCare) });
      },
    });
    assert.equal((await invoke({ ...body, model: "gpt-4o", reasoning: { effort: "high" } })).status, 200);
    assert.equal(providerCalls, 1);
  }
});

test("a stale safety resolver cannot allocate a legacy-model operation", async () => {
  const config = api.modelConfigurations.find(c => c.model === "gpt-4o" && c.route === "image_safety");
  let providerCalls = 0, sqlCalls = 0;
  const invoke = await aiEdgeHandler("validate-plant-image", { actorId: actor,
    rpc: async name => { sqlCalls++; assert.equal(name, "ai_resolve_safety_configuration"); return { id: config.id, hash: await api.modelConfigurationHash(config) }; },
    fetch: async () => { providerCalls++; throw Error("No provider permitted"); },
  });
  assert.equal((await invoke({ imageDataUrl: body.imageDataUrl })).status, 503);
  assert.equal(sqlCalls, 1); assert.equal(providerCalls, 0);
});

test("historical completed results replay without a new provider start after runtime restriction", async () => {
  let providerCalls = 0;
  const invoke = await aiEdgeHandler("plant-care-ai", { actorId: actor,
    rpc: async name => { assert.equal(name, "ai_claim_image_operation"); return { decision: "REPLAY", result: { care: syntheticCare } }; },
    fetch: async () => { providerCalls++; throw Error("Replay cannot infer"); },
  });
  assert.deepEqual(await (await invoke(body)).json(), { care: syntheticCare }); assert.equal(providerCalls, 0);
});

test("retired paid evaluators reject unauthenticated access and return 410 without SQL or inference", async () => {
  for (const name of ["vision-token-benchmark", "prompt-evaluation"]) for (const signedIn of [false, true]) {
    let providerCalls = 0, sqlCalls = 0;
    const invoke = await aiEdgeHandler(name, { actorId: actor, signedIn,
      rpc: async () => { sqlCalls++; throw Error("Retired endpoint cannot claim"); },
      fetch: async () => { providerCalls++; throw Error("Retired endpoint cannot infer"); },
    });
    for (const input of [{}, { model: "gpt-4o", detail: "low", imageDataUrl: body.imageDataUrl }, { runId: actor, inputKey: "old-case" }]) {
      assert.equal((await invoke(input)).status, signedIn ? 410 : 401);
    }
    assert.equal(sqlCalls, 0); assert.equal(providerCalls, 0);
  }
});

test("all forty Luna configuration/locale payloads retain the exact paid-evidence source bytes and identities", async () => {
  const path = "supabase/functions/_shared/aiOperation.ts";
  const previous = execFileSync("git", ["show", `18aa79931f210f63a249988c8c7cc9ecadea8470:${path}`], { encoding: "utf8" });
  const diagnosis = { diagnosis_title: "Observe", confidence: 20, confidence_label: "low", reasoning_summary: "Insufficient evidence", observed_symptoms: ["Leaf"], recommended_steps: ["Check moisture"], risk_level: "low", disclaimer: "Uncertain" };
  const validation = { containsPlant: true, plantConfidence: .95, hasSensitiveBackground: false, hasExplicitOrUnsafeContent: false, hasRestrictedFootageOrPrivateContent: false, shouldAllowUpload: true, failureReasons: [], safeUserMessage: "Allowed" };
  assert.equal(api.lunaProductionConfigurations.length, 8);
  for (const config of api.lunaProductionConfigurations) for (const language of ["en", "sk", "de", "fr", "es"]) {
    const context = { plantName: config.route === "image_safety" ? "" : "Ficus", symptomNotes: "", language };
    const contextHash = createHash("sha256").update(JSON.stringify(context)).digest("hex"), results = [];
    for (const old of [true, false]) {
      let payload, claim, calls = 0;
      const invoke = await aiEdgeHandler("model-evaluation", { actorId: actor, sourceOverrides: old ? { [path]: previous } : {},
        rpc: async (name, args) => {
          if (name === "ai_resolve_model_input") return { configurationId: config.id, configurationHash: await api.modelConfigurationHash(config), contextHash, language, householdId: household, plantId: actor };
          if (name === "ai_claim_model_operation") { claim = args; return { decision: "RUN", operationId: actor, leaseId: household, effectiveConfiguration: config.id, configurationHash: await api.modelConfigurationHash(config) }; }
          if (name === "ai_start_image_attempt") return actor;
          if (name === "ai_finish_attempt") return { state: "COMPLETED" };
          throw Error("Unexpected RPC");
        }, fetch: async (_url, init) => {
          calls++; payload = init.body;
          return Response.json({ model: "gpt-6-luna", reasoning: { effort: config.reasoning }, service_tier: "default", status: "completed", usage: syntheticUsage, output_text: JSON.stringify(config.route === "image_safety" ? validation : config.route === "diagnosis" ? diagnosis : syntheticCare) });
        },
      });
      assert.equal((await invoke({ runId: household, inputKey: "fixture", imageDataUrl: body.imageDataUrl, ...context })).status, 200);
      assert.equal(calls, 1); results.push({ payload, claim });
    }
    assert.deepEqual(results[1], results[0], `${config.id}/${language}: configuration cleanup must preserve paid-evidence payload and logical identity`);
  }
});
