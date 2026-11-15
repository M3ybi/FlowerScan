import { build } from "esbuild";
import { webcrypto } from "node:crypto";
import vm from "node:vm";

const bundles = new Map();
export const aiEdgeHandler = async (name, { actorId, rpc, fetch, signedIn = true }) => {
  if (!bundles.has(name)) {
    const bundle = await build({ entryPoints: [`supabase/functions/${name}/index.ts`], bundle: true, write: false, format: "iife", logLevel: "silent",
      plugins: [{ name: "external-auth-boundary", setup(builder) {
        builder.onResolve({ filter: /\/_shared\/auth\.ts$|^\.\/auth\.ts$|^\.\.\/_shared\/auth\.ts$/ }, () => ({ path: "auth", namespace: "fixture" }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const requireUser=async()=>globalThis.fixture.auth; export const createServiceClient=()=>globalThis.fixture.client;" }));
      } }],
    });
    bundles.set(name, bundle.outputFiles[0].text);
  }
  let handler;
  const client = { rpc: async (name, args) => { try { return { data: await rpc(name, JSON.parse(JSON.stringify(args))), error: null }; } catch (error) { return { data: null, error: { message: error.message } }; } } };
  vm.runInNewContext(bundles.get(name), {
    Deno: { env: { get: name => name === "OPENAI_MODEL" ? "gpt-4o" : name === "OPENAI_API_KEY" ? "synthetic-key" : undefined }, serve: value => { handler = value; } },
    fixture: { auth: signedIn ? { user: { id: actorId }, client } : null, client },
    crypto: webcrypto, structuredClone, btoa, atob, TextEncoder, TextDecoder, Request, Response, Headers, AbortSignal, AbortController,
    Uint8Array, Error, TypeError, SyntaxError, DOMException, setTimeout, clearTimeout, fetch,
    console: { error() {}, warn() {}, info() {} },
  });
  return body => handler(new Request("https://synthetic.invalid", { method: "POST", headers: { authorization: "Bearer synthetic", "content-type": "application/json" }, body: JSON.stringify(body) }));
};

export const syntheticCare = {
  displayName: "Synthetic plant", likelyName: "Synthetic plant", identificationConfidence: "likely", identificationNote: "Synthetic",
  shortCare: "Synthetic", light: "Synthetic", watering: "Synthetic", soil: "Synthetic", wateringIntervalDays: 7,
  carePills: Array.from({ length: 5 }, (_, index) => ({ label: `Pill ${index}`, value: "Synthetic", tone: "green" })), careTips: ["One", "Two", "Three"],
};
export const syntheticUsage = { input_tokens: 1000, input_tokens_details: { cached_tokens: 200, cache_write_tokens: 0 }, output_tokens: 100, output_tokens_details: { reasoning_tokens: 10 }, total_tokens: 1100 };
export const syntheticFacts = (usage = syntheticUsage) => ({ model: "gpt-4o-2024-08-06", serviceTier: "default", responseId: "resp_synthetic", requestId: "req_synthetic", httpStatus: 200, providerStatus: "completed", latencyMs: 20, usage });
