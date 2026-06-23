import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260617103000_remove_invite_expiry_and_viewer_removal.sql";
const nameSafetyMigrationPath = "supabase/migrations/20260617110000_household_name_safety.sql";

const read = (path: string) => readFileSync(path, "utf8");

const sql = read(migrationPath);
const nameSafetySql = read(nameSafetyMigrationPath);
const functionSlice = (name: string, nextName: string) =>
  sql.slice(sql.indexOf(`create or replace function public.${name}`), sql.indexOf(`create or replace function public.${nextName}`));

test("migration replaces invite RPCs and adds viewer removal RPC", () => {
  assert.match(sql, /drop function if exists public\.create_household_invite\(uuid, text, public\.household_member_role, timestamptz\)/);
  assert.match(sql, /create or replace function public\.create_household_invite/);
  assert.match(sql, /create or replace function public\.join_household_by_invite/);
  assert.match(sql, /create or replace function public\.list_household_invites/);
  assert.match(sql, /create or replace function public\.remove_household_viewer/);
  assert.match(sql, /create or replace function public\.rename_household/);
  assert.match(sql, /drop column if exists expires_at/);
  assert.match(sql, /grant execute on function public\.create_household_invite\(uuid, text, public\.household_member_role\) to authenticated/);
  assert.match(sql, /grant execute on function public\.remove_household_viewer\(uuid, uuid\) to authenticated/);
  assert.match(sql, /grant execute on function public\.rename_household\(uuid, text\) to authenticated/);
});

test("invite tokens are high entropy, stored only as hashes, and no expiry is written", () => {
  const createFunction = functionSlice("create_household_invite", "join_household_by_invite");

  assert.match(createFunction, /gen_random_bytes\(32\)/);
  assert.match(createFunction, /digest\(raw_token, 'sha256'\)/);
  assert.match(createFunction, /insert into public\.household_invites \(household_id, invitee_email, token_hash, role, created_by\)/);
  assert.doesNotMatch(createFunction, /insert into public\.household_invites \([^)]*\btoken\b/);
  assert.doesNotMatch(createFunction, /expires_at|invite_expires_at/);
  assert.match(createFunction, /raw_token,\s*created_invite\.created_at/s);
});

test("invite creation validates email and rejects active duplicate targets without expiry logic", () => {
  const createFunction = functionSlice("create_household_invite", "join_household_by_invite");

  assert.match(createFunction, /normalized_email := lower\(trim\(coalesce\(invite_email, ''\)\)\)/);
  assert.match(createFunction, /Invalid invite email/);
  assert.match(createFunction, /An active invite already exists for this email/);
  assert.match(createFunction, /hi\.invitee_email = normalized_email/);
  assert.match(createFunction, /hi\.used_at is null/);
  assert.match(createFunction, /hi\.revoked_at is null/);
  assert.doesNotMatch(createFunction, /expires_at|invite_expires_at|expiration/i);
});

test("invite creation still enforces owner and editor permissions", () => {
  const createFunction = functionSlice("create_household_invite", "join_household_by_invite");

  assert.match(createFunction, /invite_role = 'owner' and not public\.is_household_owner/);
  assert.match(createFunction, /invite_role <> 'owner' and not public\.can_edit_household/);
});

test("join rejects invalid revoked or reused invites for new members without expiry logic", () => {
  const joinFunction = functionSlice("join_household_by_invite", "list_household_invites");

  assert.match(joinFunction, /raw_token is null or length\(trim\(raw_token\)\) < 32/);
  assert.match(joinFunction, /revoked_at is null/);
  assert.match(joinFunction, /if invite\.used_at is not null then\s*raise exception 'Invite is already used\.'/s);
  assert.doesNotMatch(joinFunction, /expires_at|expired/i);
});

test("already-member invite joins remain idempotent and role assignment is preserved", () => {
  const joinFunction = functionSlice("join_household_by_invite", "list_household_invites");

  assert.match(joinFunction, /select \*\s*into existing_member\s*from public\.household_members/s);
  assert.match(joinFunction, /if existing_member\.household_id is null then/s);
  assert.match(joinFunction, /values \(invite\.household_id, auth\.uid\(\), invite\.role\)/);
  assert.match(joinFunction, /set used_at = now\(\)/);
});

test("list and revoke do not expose raw invite tokens or expiry data", () => {
  const listFunction = functionSlice("list_household_invites", "remove_household_viewer");
  const legacyMigration = read("supabase/migrations/20260603103000_household_invite_rpcs.sql");
  const revokeFunction = legacyMigration.slice(
    legacyMigration.indexOf("create or replace function public.revoke_household_invite"),
    legacyMigration.indexOf("create or replace function public.list_household_invites"),
  );

  assert.match(revokeFunction, /public\.can_edit_household/);
  assert.doesNotMatch(listFunction, /token_hash/);
  assert.doesNotMatch(listFunction, /token text/);
  assert.doesNotMatch(listFunction, /expires_at/);
});

test("viewer removal RPC is owner-only, viewer-only, and forbids self removal", () => {
  const removeFunction = sql.slice(sql.indexOf("create or replace function public.remove_household_viewer"));

  assert.match(removeFunction, /target_user_id = auth\.uid\(\)/);
  assert.match(removeFunction, /Owners cannot remove themselves through viewer removal/);
  assert.match(removeFunction, /hm\.user_id = auth\.uid\(\)[\s\S]*hm\.role = 'owner'/);
  assert.match(removeFunction, /Only household owners can remove viewers/);
  assert.match(removeFunction, /target_membership\.role <> 'viewer'/);
  assert.match(removeFunction, /Only viewer members can be removed through this action/);
});

test("viewer removal deletes access and restores standalone free household state when needed", () => {
  const removeFunction = sql.slice(sql.indexOf("create or replace function public.remove_household_viewer"));

  assert.match(removeFunction, /delete from public\.household_members hm[\s\S]*hm\.role = 'viewer'/);
  assert.match(removeFunction, /from public\.household_members hm[\s\S]*where hm\.user_id = target_user_id[\s\S]*limit 1/s);
  assert.match(removeFunction, /if fallback_household_id is null then/);
  assert.match(removeFunction, /insert into public\.households \(name, created_by\)/);
  assert.match(removeFunction, /values \(fallback_household_id, target_user_id, 'owner'\)/);
  assert.match(removeFunction, /insert into public\.household_report_settings \(household_id\)/);
});

test("household rename RPC is owner-only and validates safe names", () => {
  const renameFunction = nameSafetySql.slice(nameSafetySql.indexOf("create or replace function public.rename_household"));

  assert.match(renameFunction, /not public\.is_household_owner\(target_household_id\)/);
  assert.match(renameFunction, /Only household owners can rename this household/);
  assert.match(renameFunction, /normalized_name := trim\(coalesce\(household_name, ''\)\)/);
  assert.match(renameFunction, /normalized_name = ''/);
  assert.match(renameFunction, /length\(normalized_name\) > 80/);
  assert.match(renameFunction, /not public\.is_household_name_allowed\(normalized_name\)/);
  assert.match(renameFunction, /Household name contains explicit or vulgar language/);
  assert.match(renameFunction, /update public\.households[\s\S]*set name = normalized_name/);
  assert.match(renameFunction, /return updated_household/);
});

test("household creation RPC validates name length and profanity before insert", () => {
  const createFunction = nameSafetySql.slice(
    nameSafetySql.indexOf("create or replace function public.create_household_for_current_user"),
    nameSafetySql.indexOf("create or replace function public.rename_household"),
  );

  assert.match(nameSafetySql, /create or replace function public\.is_household_name_allowed/);
  assert.match(createFunction, /normalized_name := coalesce\(nullif\(trim\(household_name\), ''\), 'Moja domacnost'\)/);
  assert.match(createFunction, /length\(normalized_name\) > 80/);
  assert.match(createFunction, /not public\.is_household_name_allowed\(normalized_name\)/);
  assert.match(createFunction, /Household name contains explicit or vulgar language/);
  assert.match(createFunction, /insert into public\.households \(name, created_by\)[\s\S]*values \(normalized_name, auth\.uid\(\)\)/);
});

test("frontend repository exposes authenticated invite and viewer removal operations", () => {
  const repository = read("src/lib/plantieRepository.ts");

  assert.match(repository, /export const renameHousehold/);
  assert.match(repository, /validateHouseholdName\(name\)/);
  assert.match(repository, /\.rpc\("rename_household"/);
  assert.match(repository, /export const createHouseholdInvite/);
  assert.match(repository, /export const normalizeInviteEmail/);
  assert.match(repository, /export const isValidInviteEmail/);
  assert.match(repository, /\.rpc\("create_household_invite"/);
  assert.match(repository, /invite_email: normalizedEmail/);
  assert.doesNotMatch(repository, /invite_expires_at|expiresAt|expires_at/);
  assert.match(repository, /export const listHouseholdInvites/);
  assert.match(repository, /export const revokeHouseholdInvite/);
  assert.match(repository, /export const joinHouseholdByInvite/);
  assert.match(repository, /\.rpc\("join_household_by_invite"/);
  assert.match(repository, /export const listHouseholdMembers/);
  assert.match(repository, /\.rpc\("list_household_members"/);
  assert.match(repository, /export const removeHouseholdViewer/);
  assert.match(repository, /\.rpc\("remove_household_viewer"/);
  assert.match(repository, /export const sendHouseholdInviteEmail/);
  assert.match(repository, /functions\.invoke\("send-household-invite-email"/);
});

test("frontend invite flow creates invites without expiration UI state or payload", () => {
  const appSource = read("src/App.tsx");

  assert.match(appSource, /normalizeInviteEmail\(inviteEmail\)/);
  assert.match(appSource, /isValidInviteEmail\(normalizedEmail\)/);
  assert.match(appSource, /invite\.inviteeEmail === normalizedEmail/);
  assert.match(appSource, /createHouseholdInvite\(activeSupabaseHouseholdId, normalizedEmail, inviteRole\)/);
  assert.match(appSource, /sendHouseholdInviteEmail\(/);
  assert.match(appSource, /household\.inviteStatusSent/);
  assert.match(appSource, /inviteErrorMessage\(error\)/);
  assert.doesNotMatch(appSource, /inviteExpiresAt|setInviteExpiresAt|datetime-local|invite_expires_at|expiresAt/);
});

test("frontend keeps manual invite revoke and owner-only viewer removal actions", () => {
  const appSource = read("src/App.tsx");

  assert.match(appSource, /handleRevokeInvite/);
  assert.match(appSource, /revokeHouseholdInvite\(inviteId\)/);
  assert.match(appSource, /handleRemoveViewer/);
  assert.match(appSource, /isCurrentHouseholdOwner && member\.role === "viewer" && member\.userId !== auth\.user\?\.id/);
  assert.match(appSource, /removeHouseholdViewer\(activeSupabaseHouseholdId, member\.userId\)/);
  assert.match(appSource, /listHouseholdMembers\(activeSupabaseHouseholdId\)/);
});

test("frontend exposes owner-only household rename in sheet and menu", () => {
  const appSource = read("src/App.tsx");

  assert.match(appSource, /const canRenameHousehold = auth\.isAuthenticated && Boolean\(activeSupabaseHouseholdId\) && isCurrentHouseholdOwner/);
  assert.match(appSource, /renderHouseholdNameEditor\("sheet", "household-sheet-title"\)/);
  assert.match(appSource, /renderHouseholdNameEditor\("menu"\)/);
  assert.match(appSource, /canRenameHousehold \? \(/);
  assert.match(appSource, /validateHouseholdName\(householdNameEditDraft\)/);
  assert.match(appSource, /household\.renameUnsafe/);
  assert.match(appSource, /renameHousehold\(activeSupabaseHouseholdId, nameValidation\.name\)/);
  assert.match(appSource, /householdNameMaxLength/);
  assert.match(appSource, /applyRenamedHousehold\(household\)/);
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
