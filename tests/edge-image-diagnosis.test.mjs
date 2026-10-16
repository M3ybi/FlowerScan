import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { build } from "esbuild";

const householdId = "11111111-1111-4111-8111-111111111111";
const imageId = "22222222-2222-4222-8222-222222222222";
const fixtureBundle = await build({ entryPoints: ["tests/fixtures/imagePayload.ts"], bundle: true, write: false, format: "esm" });
const { fixtureDataUrl, jpegFixtureAtSize } = await import(`data:text/javascript;base64,${Buffer.from(fixtureBundle.outputFiles[0].text).toString("base64")}`);
const imageDataUrl = fixtureDataUrl();
const bundles = new Map();
const loadHandler = async (name, { allowed = true, signedIn = true, fetch, uploadError = null, serviceOverride } = {}) => {
  if (!bundles.has(name)) {
    const result = await build({
      entryPoints: [`supabase/functions/${name}/index.ts`], bundle: true, write: false, format: "iife",
      plugins: [{ name: "mock-external-auth", setup(builder) {
        builder.onResolve({ filter: /\/auth\.ts$/ }, () => ({ path: "auth", namespace: "fixture" }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents:
          "export const requireUser = async () => globalThis.fixture.auth; export const createServiceClient = () => globalThis.fixture.service;" }));
      } }],
    });
    bundles.set(name, result.outputFiles[0].text);
  }
  const calls = [];
  const user = { rpc: async (method) => {
    calls.push(`user:${method}`);
    if (method === "can_manage_household_content") return { data: allowed, error: null };
    if (method === "reserve_ai_analyze_usage") return { data: imageId, error: null };
    if (method === "assert_can_add_plant") return { error: null };
    throw new Error(`Unexpected user RPC: ${method}`);
  } };
  const service = {
    rpc: async (method) => { calls.push(`service:${method}`); return { error: null }; },
    storage: { from: () => ({ upload: async (_path, _bytes, options) => {
      calls.push("storage:upload");
      assert.equal(options.upsert, true);
      return { error: uploadError };
    } }) },
  };
  let handler;
  vm.runInNewContext(bundles.get(name), {
    Deno: { env: { get: () => "fixture-key" }, serve: (fn) => { handler = fn; } },
    fixture: { auth: signedIn ? { user: { id: imageId }, client: user } : null, service: serviceOverride ?? service },
    Request, Response, AbortSignal, AbortController, Uint8Array, TextDecoder, Error, TypeError, SyntaxError, DOMException, atob, setTimeout, clearTimeout,
    fetch: fetch ?? (async () => { throw new Error("Unexpected provider call"); }),
    console: { error() {}, info() {}, log() {} },
  });
  return { calls, invoke: (body, headers = {}) => handler(new Request("https://fixture.invalid", {
    method: "POST", headers: { authorization: "Bearer fixture-key", "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  })) };
};

const uploadBody = { householdId, imageId, kind: "plant", imageDataUrl, language: "en" };
test("image and AI handlers reject null and array request bodies safely", async () => {
  for (const name of ["upload-validated-image", "plant-diagnosis-ai", "plant-care-ai", "validate-plant-image"]) {
    const { invoke } = await loadHandler(name);
    assert.equal((await invoke(null)).status, 400, name);
    assert.equal((await invoke([])).status, 400, name);
  }
});
const safeValidation = {
  containsPlant: true, plantConfidence: 1, hasSensitiveBackground: false,
  hasExplicitOrUnsafeContent: false, hasRestrictedFootageOrPrivateContent: false,
  shouldAllowUpload: true, failureReasons: [], safeUserMessage: "Allowed",
};
test("upload handler rejects unauthenticated and unrelated users before storage", async () => {
  for (const [options, expected] of [[{ signedIn: false }, 401], [{ allowed: false }, 403]]) {
    const { invoke, calls } = await loadHandler("upload-validated-image", options);
    assert.equal((await invoke(uploadBody)).status, expected);
    assert.equal(calls.includes("storage:upload"), false);
  }
});
test("upload handler rejects malformed bytes before AI and never stores rejected images", async () => {
  const { invoke, calls } = await loadHandler("upload-validated-image");
  assert.equal((await invoke({ ...uploadBody, imageDataUrl: "data:image/jpeg;base64,A" })).status, 400);
  assert.deepEqual(calls, ["user:can_manage_household_content"]);
});
test("active member upload uses a household path after server validation", async () => {
  const { invoke, calls } = await loadHandler("upload-validated-image", {
    fetch: async () => Response.json({ output_text: JSON.stringify(safeValidation) }),
  });
  const response = await invoke(uploadBody);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).path, `${householdId}/plants/${imageId}/original.jpg`);
  assert.deepEqual(calls, ["user:can_manage_household_content", "storage:upload"]);
});
test("storage failure and AI rejection return failures without a success path", async () => {
  const rejected = await loadHandler("upload-validated-image", {
    fetch: async () => Response.json({ output_text: JSON.stringify({ ...safeValidation, containsPlant: false }) }),
  });
  assert.equal((await rejected.invoke(uploadBody)).status, 422);
  assert.equal(rejected.calls.includes("storage:upload"), false);
  const failed = await loadHandler("upload-validated-image", {
    fetch: async () => Response.json({ output_text: JSON.stringify(safeValidation) }), uploadError: new Error("Unavailable"),
  });
  assert.equal((await failed.invoke(uploadBody)).status, 502);
});

test("upload accepts 2 MiB decoded JPEG beyond the old base64 cap", async () => {
  const { invoke } = await loadHandler("upload-validated-image", {
    fetch: async () => Response.json({ output_text: JSON.stringify(safeValidation) }),
  });
  const imageDataUrl = fixtureDataUrl(jpegFixtureAtSize(2 * 1024 * 1024));
  assert.ok(imageDataUrl.length > 1_600_000);
  assert.equal((await invoke({ ...uploadBody, imageDataUrl })).status, 200);
});

test("upload reports size, format and corruption separately before AI or storage", async () => {
  const { invoke, calls } = await loadHandler("upload-validated-image");
  for (const [imageDataUrl, status, code] of [
    [fixtureDataUrl(jpegFixtureAtSize(2 * 1024 * 1024 + 1)), 413, "IMAGE_TOO_LARGE"],
    ["data:image/png;base64,iVBORw0KGgo=", 415, "UNSUPPORTED_IMAGE_FORMAT"],
    ["data:image/jpeg;base64,/9j/AA==", 400, "INVALID_IMAGE"],
  ]) {
    const response = await invoke({ ...uploadBody, imageDataUrl });
    assert.equal(response.status, status);
    assert.equal((await response.json()).code, code);
  }
  assert.equal(calls.includes("storage:upload"), false);
});

test("oversized request bodies are bounded before JSON/base64 processing", async () => {
  const { invoke, calls } = await loadHandler("upload-validated-image");
  for (const response of [
    await invoke(uploadBody, { "content-length": "3000000" }),
    await invoke({ ...uploadBody, padding: "x".repeat(3_000_000) }),
  ]) {
    assert.equal(response.status,413);
    assert.equal((await response.json()).code,"IMAGE_TOO_LARGE");
  }
  assert.deepEqual(calls,[]);
});

test("provider timeout, outage and corrupt image remain distinct from safety rejection", async () => {
  for (const [fetch, status, code] of [
    [async () => { throw new DOMException("", "AbortError"); }, 504, "IMAGE_NETWORK_TIMEOUT"],
    [async () => Response.json({ error: { code: "unavailable" } }, { status: 503 }), 503, "IMAGE_SERVICE_UNAVAILABLE"],
    [async () => Response.json({ error: { code: "invalid_image" } }, { status: 400 }), 400, "INVALID_IMAGE"],
  ]) {
    const { invoke, calls } = await loadHandler("upload-validated-image", { fetch });
    const response = await invoke(uploadBody);
    assert.equal(response.status,status);
    assert.equal((await response.json()).code,code);
    assert.equal(calls.includes("storage:upload"),false);
  }
});

test("validation, care and diagnosis all accept the normalized 2 MiB transport contract", async () => {
  const imageDataUrl = fixtureDataUrl(jpegFixtureAtSize(2 * 1024 * 1024));
  const care = { displayName: "Fixture", likelyName: "Fixture", identificationConfidence: "confident", identificationNote: "Fixture",
    shortCare: "Fixture", light: "Fixture", watering: "Fixture", soil: "Fixture", wateringIntervalDays: 7,
    carePills: Array.from({length:5},(_,index)=>({label:`Fixture ${index}`,tone:"green",value:"Fixture"})),careTips:["One","Two","Three"] };
  const diagnosis = { confidence:80,confidence_label:"high",risk_level:"low",diagnosis_title:"Fixture",disclaimer:"Estimate",
    reasoning_summary:"Fixture",observed_symptoms:["Leaf"],recommended_steps:["Check soil"] };
  for (const [name,payload] of [["validate-plant-image",safeValidation],["plant-care-ai",care],["plant-diagnosis-ai",diagnosis]]) {
    const { invoke } = await loadHandler(name,{fetch:async()=>Response.json({output_text:JSON.stringify(payload)})});
    assert.equal((await invoke({householdId,plantName:"Fixture",imageDataUrl,language:"en",generationSource:"initial_plant_add"})).status,200,name);
  }
});

const diagnosisBody = { householdId, plantName: "Fixture plant", imageDataUrl, language: "en" };
test("incomplete provider diagnoses release quota and return a safe service error", async () => {
  const { invoke, calls } = await loadHandler("plant-diagnosis-ai", { fetch: async () => Response.json({
    status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output_text: '{"diagnosis_title":',
  }) });
  const response = await invoke(diagnosisBody);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "IMAGE_SERVICE_UNAVAILABLE");
  assert.deepEqual(calls, ["user:reserve_ai_analyze_usage", "service:release_ai_analyze_reservation"]);
});
test("diagnosis network rejection releases quota through the trusted service", async () => {
  const { invoke, calls } = await loadHandler("plant-diagnosis-ai", { fetch: async () => { throw new Error("Network unavailable"); } });
  assert.equal((await invoke(diagnosisBody)).status, 502);
  assert.deepEqual(calls, ["user:reserve_ai_analyze_usage", "service:release_ai_analyze_reservation"]);
});

test("initial care provider failure returns an actionable failure", async () => {
  const { invoke } = await loadHandler("plant-care-ai", { fetch: async () => { throw new Error("Network unavailable"); } });
  assert.equal((await invoke({ ...diagnosisBody, generationSource: "initial_plant_add" })).status, 502);
});
test("valid diagnosis commits quota once through the trusted service", async () => {
  const { invoke, calls } = await loadHandler("plant-diagnosis-ai", { fetch: async () => Response.json({
    output_text: JSON.stringify({ confidence: 80, confidence_label: "high", risk_level: "low", diagnosis_title: "Dry leaf",
      disclaimer: "Estimate", reasoning_summary: "Dry soil", observed_symptoms: ["Dry leaf"], recommended_steps: ["Check soil"] }),
  }) });
  assert.equal((await invoke(diagnosisBody)).status, 200);
  assert.deepEqual(calls, ["user:reserve_ai_analyze_usage", "service:commit_ai_analyze_usage"]);
});

test("primary webhook forwards grace periods and effective refund revocations", async () => {
  const applied = [];
  const serviceOverride = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    rpc: async (_name, args) => { applied.push(args); return { data: true, error: null }; },
  };
  const { invoke } = await loadHandler("revenuecat-webhook", { serviceOverride });
  const event = { app_user_id: `hh_${householdId}`, id: "grace", type: "BILLING_ISSUE", entitlement_ids: ["premium"],
    original_transaction_id: "fixture-receipt", product_id: "plantie_premium_monthly", store: "PLAY_STORE",
    purchased_at_ms: 1000, expiration_at_ms: 2000, grace_period_expiration_at_ms: 3000, event_timestamp_ms: 2001 };
  assert.equal((await invoke({ event })).status, 200);
  assert.equal(applied[0].period_end, new Date(3000).toISOString());
  assert.equal((await invoke({ event: { ...event, id: "refund", type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT" } })).status, 200);
  assert.equal(applied[1].event_status, "refunded");
});
