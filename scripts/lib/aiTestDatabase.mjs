import { randomUUID, createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";

// Real PostgreSQL sessions. Platform services are explicit local SQL fixtures;
// this is never a hosted Supabase reset or a Vault encryption test.
export const createAiTestDatabase = async () => {
  const connection = process.env.PLANTIE_TEST_POSTGRES_URL;
  if (!connection) throw new Error("PLANTIE_TEST_POSTGRES_URL is required (disposable loopback administrator only).");
  const url = new URL(connection);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.search) throw new Error("Disposable loopback PostgreSQL required.");
  const admin = new pg.Client({ connectionString: connection });
  await admin.connect();
  const database = `plantie_ai_${randomUUID().replaceAll("-", "")}`;
  const roles = [], clients = [];
  let created = false;
  const close = async () => {
    await Promise.allSettled(clients.map(client => client.end()));
    try { if (created) await admin.query(`drop database ${database}`); for (const role of roles) await admin.query(`drop role ${role}`); }
    finally { await admin.end(); }
  };
  try {
    await admin.query("select pg_advisory_lock(hashtext('plantie-disposable-fixture-roles'))");
    for (const role of ["anon", "authenticated", "service_role"]) {
      if (!(await admin.query("select exists(select 1 from pg_roles where rolname=$1) present", [role])).rows[0].present) { await admin.query(`create role ${role}`); roles.push(role); }
    }
    await admin.query(`create database ${database} encoding 'UTF8' template template0 lc_collate 'C' lc_ctype 'C'`); created = true;
    url.pathname = `/${database}`;
    const connect = async () => { const client = new pg.Client({ connectionString: url.toString(), statement_timeout: 15000 }); await client.connect(); clients.push(client); return client; };
    const owner = await connect();
    await owner.query(`create schema auth; create schema storage; create schema extensions; create schema vault;
      create extension pgcrypto with schema extensions;
      create table auth.users(id uuid primary key,aud text,role text,email text,email_confirmed_at timestamptz,created_at timestamptz,updated_at timestamptz,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),current_setting('request.jwt.claims',true)::jsonb->>'role') $$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb,unique(bucket_id,name));
      alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
      create table vault.fixture_secrets(id uuid primary key default gen_random_uuid(),decrypted_secret text);
      create view vault.decrypted_secrets as select * from vault.fixture_secrets;
      create function vault.create_secret(text) returns uuid language sql as $$ insert into vault.fixture_secrets(decrypted_secret) values ($1) returning id $$;
      grant usage on schema public,auth,storage,extensions to anon,authenticated,service_role;
      grant all on storage.objects to authenticated,service_role; grant all on storage.buckets to service_role;`);
    for (const file of (await readdir("supabase/migrations")).filter(file => /^\d{14}_.*\.sql$/.test(file)).sort()) {
      const sql = (await readFile(`supabase/migrations/${file}`, "utf8")).replace("create extension if not exists supabase_vault with schema vault;", "-- Explicit plaintext test-only Vault adapter.");
      try { await owner.query(sql); } catch (error) { throw new Error(`Migration ${file}: ${error.message}`, { cause: error }); }
    }
    await owner.query("select set_config('request.jwt.claim.role','service_role',false)");
    return { owner, connect, close, database };
  } catch (error) { await close(); throw error; }
};

export const aiRpc = async (client, name, args = {}) => {
  if (!/^(ai_[a-z_]+|admit_image_operation|reserve_image_upload|can_manage_household_content)$/.test(name) || !Object.keys(args).every(key => /^[a-z_][a-z_0-9]*$/.test(key))) throw new Error("Unexpected fixture RPC.");
  const entries = Object.entries(args);
  const sql = `select public.${name}(${entries.map(([key], index) => `${key} => $${index + 1}`).join(",")}) as data`;
  return (await client.query(sql, entries.map(([, value]) => value))).rows[0].data;
};

// Only used with the disposable loopback fixture above. Exercise the actual
// owner approval RPC; never add a production test bypass or mint owner JWTs.
export const createApprovedTestCampaign = async (client, actors, { maxUsd = 4, maxAttempts = 120, imageHashes = [] } = {}) => {
  const taskKey = randomUUID(), hash = createHash('sha256').update(taskKey).digest('hex');
  await client.query('update auth.users set email_confirmed_at=coalesce(email_confirmed_at,now()) where id=$1',[actors[0]]);
  await client.query("insert into ai_private.owner_operators(user_id,authorization_reference) values($1,'Disposable fixture owner') on conflict do nothing",[actors[0]]);
  const configurations=(await client.query("select jsonb_object_agg(id,configuration_hash) value from ai_private.model_configurations where definition->>'model'='gpt-6-luna'")).rows[0].value;
  await client.query("insert into ai_private.luna_campaign_proposals(sha256,plan,max_attempts,max_usd,duration_seconds) values($1,$2,120,4,3600)",[hash,{configurationHashes:configurations,imageHashes}]);
  const approval = await aiRpc(client,'ai_owner_approve_campaign',{actor:actors[0],proposal_sha256:hash});
  return (await client.query("insert into ai_private.model_evaluation_runs(task_key,actor_ids,enabled,expires_at,max_usd,max_attempts,owner_campaign_approval_id) values($1,$2,true,now()+interval '1 hour',$3,$4,$5) returning id",[taskKey,actors,maxUsd,maxAttempts,approval.id])).rows[0].id;
};
