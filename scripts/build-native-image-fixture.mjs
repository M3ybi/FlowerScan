import { mkdir, writeFile } from "node:fs/promises";
import { build } from "esbuild";
const directory = ".tmp-tests/native-image-fixture";
await mkdir(directory, { recursive: true });
await build({ entryPoints: ["tests/fixtures/native-image-selection.ts"], bundle: true, outdir: directory, entryNames: "fixture", format: "esm", platform: "browser",
  define: { "import.meta.env.DEV": "false" }, logLevel: "warning" });
await writeFile(`${directory}/index.html`, `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' blob: data:; img-src 'self' blob: data:; worker-src 'self' blob:; style-src 'unsafe-inline'">
<title>OFFLINE native image fixture</title></head><body><h1>OFFLINE image selection</h1><p>No authentication, uploads, AI or purchases.</p>
<button id="add" style="font-size:24px;padding:24px">Add selection</button><button id="diagnosis" style="font-size:24px;padding:24px">Diagnosis selection</button>
<output style="display:block;white-space:pre-wrap"></output><script type="module" src="fixture.js"></script></body></html>`);
console.log(`Offline fixture assets: ${directory}. Use only a disposable emulator/debug APK; do not publish.`);
