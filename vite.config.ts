import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { releaseEndpoint, validateReleaseEnvironment } from "./scripts/lib/releaseEnvironment";

export default defineConfig(({ mode, command }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const environment = command === "build" ? validateReleaseEnvironment(env, mode) : "local";
  return {
    base: process.env.VITE_BASE_PATH ?? "/",
    build: { sourcemap: false },
    plugins: [react(), {
      name: "plantie-release-manifest",
      generateBundle(_options, bundle) {
        const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
        const dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim().length > 0;
        const entries = Object.values(bundle).flatMap(item => item.type === "chunk" && item.isEntry
          ? [{ file: item.fileName, sha256: createHash("sha256").update(item.code).digest("hex") }] : []);
        this.emitFile({ type: "asset", fileName: "plantie-release.json", source: JSON.stringify({ schemaVersion: 1, revision, dirty, environment,
          backendFingerprint: releaseEndpoint(env.VITE_SUPABASE_URL) ? createHash("sha256").update(releaseEndpoint(env.VITE_SUPABASE_URL)).digest("hex") : null,
          entries, generatedAtUtc: new Date().toISOString() }, null, 2) });
      },
    }],
  };
});
