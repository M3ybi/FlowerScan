import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, readdir, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import pg from "pg";
import { verifyDatabaseRelease } from "./lib/verifyDatabaseRelease.mjs";
import { supabaseFailureSummary, supabaseFailureSignals } from "./lib/supabaseDiagnostics.mjs";

// A dedicated, random local project. Never --linked, never copy .temp/.env or
// start/reset/stop the workspace's configured Supabase project.
const context = spawnSync("docker", ["context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"], { encoding: "utf8", windowsHide: true, timeout: 10_000 });
let host = process.env.DOCKER_HOST;
try { host ??= JSON.parse(context.stdout); } catch { /* Missing Docker/context is blocked below. */ }
if (!host || !/^(unix:|npipe:|tcp:\/\/(localhost|127\.0\.0\.1)(:|\/|$))/.test(host)) {
  console.log("BLOCKED: a local Docker engine is required for full Supabase verification."); process.exit(2);
}
const docker = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], { encoding: "utf8", windowsHide: true, timeout: 10_000 });
if (docker.status !== 0) {
  console.log("BLOCKED: a local Docker engine is required for full Supabase verification."); process.exit(2);
}
for (const port of [54320, 54321, 54322, 54323, 54324, 54327, 54329]) {
  const free = await new Promise(resolve => { const server = createServer(); server.on("error", () => resolve(false)); server.listen(port, "127.0.0.1", () => server.close(() => resolve(true))); });
  if (!free) { console.log(`BLOCKED: local Supabase test port ${port} is occupied; existing services will not be stopped.`); process.exit(2); }
}
const workspace = await mkdtemp(path.join(tmpdir(), "plantie-v4-supabase-"));
const project = `plantie-v4-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const migrationDir = path.join(workspace, "supabase", "migrations");
const cli = path.resolve("node_modules/supabase/dist/supabase.js");
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(SUPABASE_|OPENAI_|RESEND_|REVENUECAT_|SEND_EMAIL_|VITE_)/.test(key)));
const run = args => {
  const result = spawnSync(process.execPath, [cli, ...args, "--workdir", workspace], { cwd: workspace, env, encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  // CLI status contains local credentials. Keep it in memory; never echo it.
  if (result.status !== 0) throw new Error(`Disposable Supabase command failed: ${args.slice(0, 2).join(" ")} (exit ${result.status ?? 1}; ${supabaseFailureSummary(result)}; stdout ${result.stdout?.length ?? 0} bytes; stderr ${result.stderr?.length ?? 0} bytes; signals ${supabaseFailureSignals(result)})`);
  return result.stdout;
};
let client;
let started = false;
try {
  await mkdir(migrationDir, { recursive: true });
  let config = await readFile("supabase/config.toml", "utf8");
  config = config.replace(/^project_id = .+$/m, `project_id = "${project}"`)
    .replace('sql_paths = ["./seed.sql"]', "sql_paths = []")
    .replace('openai_api_key = "env(OPENAI_API_KEY)"', 'openai_api_key = ""');
  await writeFile(path.join(workspace, "supabase", "config.toml"), config);
  const migrations = (await readdir("supabase/migrations")).filter(name => /^\d{14}_.+\.sql$/.test(name)).sort();
  const baseline = migrations.filter(name => name < "20261018190000");
  for (const name of baseline) await copyFile(`supabase/migrations/${name}`, path.join(migrationDir, name));
  started = true;
  run(["start"]);
  run(["db", "reset", "--local", "--no-seed"]);
  const status = JSON.parse(run(["status", "--output", "json"]));
  const url = new URL(status.DB_URL);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.search) throw new Error("Disposable stack returned an unexpected database address.");
  client = new pg.Client({ connectionString: url.toString() }); await client.connect();
  const user = randomUUID(), home = randomUUID();
  await client.query("insert into auth.users(id,aud,role,email) values ($1,'authenticated','authenticated',$2)", [user, `fixture-${user}@example.invalid`]);
  await client.query("insert into public.households(id,name,created_by) values ($1,'Synthetic upgrade fixture',$2)", [home, user]);
  const before = (await client.query("select row_to_json(h) value from public.households h where id=$1", [home])).rows[0].value;
  for (const name of migrations.filter(name => !baseline.includes(name))) await copyFile(`supabase/migrations/${name}`, path.join(migrationDir, name));
  run(["migration", "up", "--local"]);
  assert.deepEqual((await client.query("select row_to_json(h) value from public.households h where id=$1", [home])).rows[0].value, before);
  const fixtures = (await readdir("supabase/tests")).filter(name => name.endsWith(".sql")).sort();
  const verify = async () => {
    for (const name of fixtures) {
      await client.query("begin");
      try { await client.query(await readFile(`supabase/tests/${name}`, "utf8")); }
      finally { await client.query("rollback"); }
    }
    return (await client.query("select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname")).rows;
  };
  const upgraded = await verify();
  await client.end(); client = undefined;
  run(["db", "reset", "--local", "--no-seed"]);
  client = new pg.Client({ connectionString: url.toString() }); await client.connect();
  assert.deepEqual(await verify(), upgraded, "clean and upgraded Supabase RLS policies match");
  await verifyDatabaseRelease(client, url.toString());
  console.log(`PASS: full disposable Supabase clean replay (${migrations.length} migrations), synthetic upgrade and ${fixtures.length} SQL fixtures twice. Hosted configuration and device/provider acceptance remain unverified.`);
} finally {
  await client?.end();
  if (started) run(["stop", "--no-backup"]);
  const resolved = path.resolve(workspace);
  if (path.dirname(resolved) !== path.resolve(tmpdir()) || !path.basename(resolved).startsWith("plantie-v4-supabase-")) throw new Error("Unexpected disposable cleanup target.");
  await rm(resolved, { recursive: true, force: true });
}
