import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

test("source graph retains the URL-loaded HEIC worker and writes only generated output", () => {
  execFileSync(process.execPath, ["scripts/analyze-source-graph.mjs", "--write"], { stdio: "pipe" });
  const graph = JSON.parse(readFileSync(".tmp-tests/source-graph.json", "utf8"));
  assert.deepEqual(graph.unresolved, []);
  assert.deepEqual(graph.cycles, []);
  assert.ok(graph.imports.some(edge => edge.to === "src/lib/heicDecode.worker.ts" && edge.kind === "worker"));
});
