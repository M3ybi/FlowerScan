import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260603103000_household_invite_rpcs.sql";

const read = (path: string) => readFileSync(path, "utf8");

test("migration creates Supabase household invite RPCs", () => {
  const sql = read(migrationPath);

  assert.match(sql, /create or replace function public\.create_household_invite/);
  assert.match(sql, /create or replace function public\.join_household_by_invite/);
  assert.match(sql, /create or replace function public\.revoke_household_invite/);
  assert.match(sql, /create or replace function public\.list_household_invites/);
  assert.match(sql, /create or replace function public\.list_household_members/);
  assert.match(sql, /grant execute on function public\.create_household_invite/);
  assert.match(sql, /grant execute on function public\.list_household_members/);
});

test("invite tokens are high entropy and stored only as hashes", () => {
  const sql = read(migrationPath);
  const createFunction = sql.slice(sql.indexOf("create or replace function public.create_household_invite"), sql.indexOf("create or replace function public.join_household_by_invite"));

  assert.match(createFunction, /gen_random_bytes\(32\)/);
  assert.match(createFunction, /digest\(raw_token, 'sha256'\)/);
  assert.match(createFunction, /insert into public\.household_invites \(household_id, invitee_email, token_hash, role, expires_at, created_by\)/);
  assert.doesNotMatch(createFunction, /insert into public\.household_invites \([^)]*\btoken\b/);
  assert.match(createFunction, /raw_token,\s*created_invite\.created_at/s);
});

test("invite creation validates email and rejects active duplicate targets", () => {
  const sql = read(migrationPath);
  const createFunction = sql.slice(sql.indexOf("create or replace function public.create_household_invite"), sql.indexOf("create or replace function public.join_household_by_invite"));

  assert.match(sql, /add column if not exists invitee_email text/);
  assert.match(createFunction, /normalized_email := lower\(trim\(coalesce\(invite_email, ''\)\)\)/);
  assert.match(createFunction, /Invalid invite email/);
  assert.match(createFunction, /An active invite already exists for this email/);
  assert.match(createFunction, /hi\.invitee_email = normalized_email/);
});

test("invite creation enforces owner and editor permissions", () => {
  const sql = read(migrationPath);
  const createFunction = sql.slice(sql.indexOf("create or replace function public.create_household_invite"), sql.indexOf("create or replace function public.join_household_by_invite"));

  assert.match(createFunction, /invite_role = 'owner' and not public\.is_household_owner/);
  assert.match(createFunction, /invite_role <> 'owner' and not public\.can_edit_household/);
  assert.match(createFunction, /invite_expires_at is not null and invite_expires_at <= now\(\)/);
});

test("join rejects invalid expired revoked or reused invites for new members", () => {
  const sql = read(migrationPath);
  const joinFunction = sql.slice(sql.indexOf("create or replace function public.join_household_by_invite"), sql.indexOf("create or replace function public.revoke_household_invite"));

  assert.match(joinFunction, /raw_token is null or length\(trim\(raw_token\)\) < 32/);
  assert.match(joinFunction, /revoked_at is null/);
  assert.match(joinFunction, /expires_at is null or expires_at > now\(\)/);
  assert.match(joinFunction, /if invite\.used_at is not null then\s*raise exception 'Invite is already used\.'/s);
});

test("already-member invite joins are idempotent and role assignment is preserved", () => {
  const sql = read(migrationPath);
  const joinFunction = sql.slice(sql.indexOf("create or replace function public.join_household_by_invite"), sql.indexOf("create or replace function public.revoke_household_invite"));

  assert.match(joinFunction, /select \*\s*into existing_member\s*from public\.household_members/s);
  assert.match(joinFunction, /if existing_member\.household_id is null then/s);
  assert.match(joinFunction, /values \(invite\.household_id, auth\.uid\(\), invite\.role\)/);
  assert.match(joinFunction, /set used_at = now\(\)/);
});

test("list and revoke do not expose raw invite tokens", () => {
  const sql = read(migrationPath);
  const listFunction = sql.slice(sql.indexOf("create or replace function public.list_household_invites"));
  const revokeFunction = sql.slice(sql.indexOf("create or replace function public.revoke_household_invite"), sql.indexOf("create or replace function public.list_household_invites"));

  assert.match(revokeFunction, /public\.can_edit_household/);
  assert.doesNotMatch(listFunction, /token_hash/);
  assert.doesNotMatch(listFunction, /token text/);
});

test("frontend repository exposes authenticated invite operations", () => {
  const repository = read("src/lib/plantieRepository.ts");

  assert.match(repository, /export const createHouseholdInvite/);
  assert.match(repository, /export const normalizeInviteEmail/);
  assert.match(repository, /export const isValidInviteEmail/);
  assert.match(repository, /\.rpc\("create_household_invite"/);
  assert.match(repository, /invite_email: normalizedEmail/);
  assert.match(repository, /export const listHouseholdInvites/);
  assert.match(repository, /export const revokeHouseholdInvite/);
  assert.match(repository, /export const joinHouseholdByInvite/);
  assert.match(repository, /\.rpc\("join_household_by_invite"/);
  assert.match(repository, /export const listHouseholdMembers/);
  assert.match(repository, /\.rpc\("list_household_members"/);
  assert.match(repository, /export const sendHouseholdInviteEmail/);
  assert.match(repository, /functions\.invoke\("send-household-invite-email"/);
});

test("frontend invite flow handles valid invalid duplicate and backend failure states", () => {
  const appSource = read("src/App.tsx");

  assert.match(appSource, /normalizeInviteEmail\(inviteEmail\)/);
  assert.match(appSource, /isValidInviteEmail\(normalizedEmail\)/);
  assert.match(appSource, /invite\.inviteeEmail === normalizedEmail/);
  assert.match(appSource, /createHouseholdInvite\(\s*activeSupabaseHouseholdId,\s*normalizedEmail/s);
  assert.match(appSource, /sendHouseholdInviteEmail\(/);
  assert.match(appSource, /household\.inviteStatusSent/);
  assert.match(appSource, /inviteErrorMessage\(error\)/);
});

test("signed-out pending invite resumes after authentication", () => {
  const appSource = read("src/App.tsx");

  assert.match(appSource, /pendingInviteStorageKey/);
  assert.match(appSource, /window\.localStorage\.setItem\(pendingInviteStorageKey, token\)/);
  assert.match(appSource, /window\.localStorage\.getItem\(pendingInviteStorageKey\)/);
  assert.match(appSource, /handleJoinInvite\(pendingInvite\)/);
  assert.match(appSource, /#\/join\?invite=/);
});

test("legacy household links remain available only through legacy compatibility paths", () => {
  const appSource = read("src/App.tsx");

  assert.match(appSource, /createHouseholdApiUrl\("\/\.netlify\/functions\/household-access"/);
  assert.match(appSource, /isLegacyNetlifyBackendEnabled/);
  assert.match(appSource, /getHouseholdTokenFromUrl/);
  assert.doesNotMatch(appSource, /Legacy household links still work only through the migration fallback/);
});
