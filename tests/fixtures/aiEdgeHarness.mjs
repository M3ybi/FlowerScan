import { build } from "esbuild";
import { webcrypto, createHash } from "node:crypto";
import { resolve } from "node:path";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const historicalManifest = JSON.parse(readFileSync(new URL('./ai-model-manifest.json',import.meta.url),'utf8'));
const productionManifest = JSON.parse(readFileSync(new URL('./ai-luna-manifest.json',import.meta.url),'utf8'));
export const productionTestBinding = (kind = 'initial_care') => {
  const route = ['image_validation','upload_validation'].includes(kind) ? 'image_safety' : kind;
  const config = productionManifest.find(c=>c.definition.route===route&&c.definition.reasoning==='none');
  if (!config) throw Error('Unknown production fixture route');
  return { effectiveConfiguration: config.id, configurationHash: config.hash };
};
export const historicalTestBinding = (kind = 'initial_care') => {
  const route = ['image_validation','upload_validation'].includes(kind) ? 'image_safety' : kind;
  const config = historicalManifest.find(c=>c.id===`${route}:gpt-4o:legacy:v1`);
  if (!config) throw Error('Unknown historical fixture route');
  return { effectiveConfiguration: config.id, configurationHash: config.hash };
};

const bundles = new Map();
export const aiEdgeHandler = async (name, { actorId, rpc, fetch, signedIn = true, sourceOverrides = {}, now, logs }) => {
  const key = name + createHash("sha256").update(JSON.stringify(sourceOverrides)).digest("hex");
  if (!bundles.has(key)) {
    const bundle = await build({ entryPoints: [`supabase/functions/${name}/index.ts`], bundle: true, write: false, format: "iife", logLevel: "silent",
      plugins: [{ name: "external-auth-boundary", setup(builder) {
        builder.onResolve({ filter: /\/_shared\/auth\.ts$|^\.\/auth\.ts$|^\.\.\/_shared\/auth\.ts$/ }, () => ({ path: "auth", namespace: "fixture" }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const requireUser=async()=>globalThis.fixture.auth; export const createServiceClient=()=>globalThis.fixture.client;" }));
        builder.onLoad({ filter: /\.ts$/ }, args => {
          const entry = Object.entries(sourceOverrides).find(([path]) => resolve(path) === args.path);
          if (entry) return { contents: entry[1], loader: "ts" };
        });
      } }],
    });
    bundles.set(key, bundle.outputFiles[0].text);
  }
  let handler;
  const client = { rpc: async (name, args) => { try { return { data: await rpc(name, JSON.parse(JSON.stringify(args))), error: null }; } catch (error) { return { data: null, error: { message: error.message } }; } } };
  const FixtureDate = now ? class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return Date.parse(now); } } : Date;
  vm.runInNewContext(bundles.get(key), {
    Deno: { env: { get: name => name === "OPENAI_MODEL" ? "gpt-4o" : name === "OPENAI_API_KEY" ? "synthetic-key" : undefined }, serve: value => { handler = value; } },
    fixture: { auth: signedIn ? { user: { id: actorId }, client } : null, client },
    crypto: webcrypto, structuredClone, btoa, atob, TextEncoder, TextDecoder, Request, Response, Headers, AbortSignal, AbortController,
    Uint8Array, Error, TypeError, SyntaxError, DOMException, setTimeout, clearTimeout, fetch, Date: FixtureDate,
    console: { error() {}, warn: (...args) => logs?.push(args), info() {} },
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
