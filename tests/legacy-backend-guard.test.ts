import assert from "node:assert/strict";
import test from "node:test";
import type { Handler } from "@netlify/functions";
import { isLegacyNetlifyServerEnabled } from "../netlify/functions/_shared/household-scope";
import { handler as householdAccess } from "../netlify/functions/household-access";
import { handler as plantState } from "../netlify/functions/plant-state";
import { handler as plantRecords } from "../netlify/functions/plant-records";
import { handler as reportSettings } from "../netlify/functions/report-settings";
import { handler as pushSubscription } from "../netlify/functions/push-subscription";
import { handler as pushPublicKey } from "../netlify/functions/push-public-key";
import { handler as plantReport } from "../netlify/functions/plant-report";
import { handler as pushWatering } from "../netlify/functions/push-watering-notifications";
import { handler as plantCareAi } from "../netlify/functions/plant-care-ai";
import { handler as plantDiagnosisAi } from "../netlify/functions/plant-diagnosis-ai";

const invoke = async (handler: Handler, method: string, body?: unknown, householdToken?: string) => {
  const result = await handler({
    httpMethod: method,
    headers: {},
    queryStringParameters: householdToken ? { householdId: householdToken } : {},
    body: body === undefined ? null : JSON.stringify(body),
  } as Parameters<Handler>[0], {} as Parameters<Handler>[1], () => undefined);
  assert.ok(result && typeof result === "object", "Handler should return its response directly.");
  return result;
};

const withServerFlag = async (flag: string | undefined, run: () => Promise<void>) => {
  const previous = process.env.ENABLE_NETLIFY_LEGACY_BACKEND;
  if (flag === undefined) delete process.env.ENABLE_NETLIFY_LEGACY_BACKEND;
  else process.env.ENABLE_NETLIFY_LEGACY_BACKEND = flag;
  try { await run(); } finally {
    if (previous === undefined) delete process.env.ENABLE_NETLIFY_LEGACY_BACKEND;
    else process.env.ENABLE_NETLIFY_LEGACY_BACKEND = previous;
  }
};

test("legacy server gate accepts only the exact operator opt-in", () => {
  for (const flag of ["", "false", "TRUE", "1", " true "]) assert.equal(isLegacyNetlifyServerEnabled(flag), false);
  assert.equal(isLegacyNetlifyServerEnabled("true"), true);
});

test("all public legacy token APIs deny access by default before storage or token lookup", async () => {
  await withServerFlag(undefined, async () => {
    const requests: Array<[Handler, string, unknown?]> = [
      [householdAccess, "GET"], [householdAccess, "POST", { name: "Old household" }],
      [plantState, "GET"], [plantState, "POST", {}],
      [plantRecords, "GET"], [plantRecords, "POST", { records: {} }],
      [reportSettings, "GET"], [reportSettings, "POST", { recipient: "recipient@example.com" }],
      [pushSubscription, "POST", {}], [pushSubscription, "DELETE", {}], [pushPublicKey, "GET"],
    ];
    for (const [handler, method, body] of requests) {
      const response = await invoke(handler, method, body, "A".repeat(32));
      assert.equal(response.statusCode, 410);
      assert.match(response.body ?? "", /Legacy household access is disabled/);
      assert.doesNotMatch(response.body ?? "", /AAAA|recipient@example.com/);
    }
    assert.equal((await invoke(householdAccess, "OPTIONS")).statusCode, 204);
  });
});

test("browser rollback configuration cannot enable the legacy server", async () => {
  const previous = process.env.VITE_ENABLE_NETLIFY_LEGACY_BACKEND;
  process.env.VITE_ENABLE_NETLIFY_LEGACY_BACKEND = "true";
  try {
    await withServerFlag("false", async () => {
      assert.equal((await invoke(plantState, "GET", undefined, "A".repeat(32))).statusCode, 410);
    });
  } finally {
    if (previous === undefined) delete process.env.VITE_ENABLE_NETLIFY_LEGACY_BACKEND;
    else process.env.VITE_ENABLE_NETLIFY_LEGACY_BACKEND = previous;
  }
});

test("anonymous legacy AI requests stop before OpenAI even with a configured provider key", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  let providerCalls = 0;
  process.env.OPENAI_API_KEY = "test-only-not-a-real-key";
  globalThis.fetch = async () => {
    providerCalls += 1;
    throw new Error("No provider network request should be made.");
  };
  try {
    await withServerFlag(undefined, async () => {
      const input = { plantName: "Test plant", imageDataUrl: "data:image/jpeg;base64,AAAA" };
      for (const handler of [plantCareAi, plantDiagnosisAi]) {
        const response = await invoke(handler, "POST", input);
        assert.equal(response.statusCode, 410);
        assert.match(response.body ?? "", /Legacy household access is disabled/);
      }
      assert.equal(providerCalls, 0);
    });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("explicit internal rollback preserves existing token validation and public-key responses", async () => {
  await withServerFlag("true", async () => {
    for (const handler of [householdAccess, plantState, plantRecords, reportSettings]) {
      assert.equal((await invoke(handler, "GET")).statusCode, 401);
    }
    assert.equal((await invoke(pushSubscription, "POST", {})).statusCode, 401);
    assert.equal((await invoke(householdAccess, "POST", { householdId: "invalid" })).statusCode, 400);
    for (const handler of [plantCareAi, plantDiagnosisAi]) assert.equal((await invoke(handler, "GET")).statusCode, 405);
    const previous = process.env.VAPID_PUBLIC_KEY;
    process.env.VAPID_PUBLIC_KEY = "test-public-key";
    try {
      const response = await invoke(pushPublicKey, "GET");
      assert.equal(response.statusCode, 200);
      assert.deepEqual(JSON.parse(response.body ?? "{}"), { publicKey: "test-public-key" });
    } finally {
      if (previous === undefined) delete process.env.VAPID_PUBLIC_KEY;
      else process.env.VAPID_PUBLIC_KEY = previous;
    }
  });
});

test("scheduled legacy delivery jobs stop before storage, provider configuration or sending", async () => {
  await withServerFlag(undefined, async () => {
    for (const handler of [plantReport, pushWatering]) {
      const response = await invoke(handler, "POST");
      assert.equal(response.statusCode, 200);
      assert.equal(response.body, "Skipped: legacy household backend is disabled.");
    }
  });
});
