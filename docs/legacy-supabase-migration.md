# Plantie legacy-to-Supabase migration

This phase adds an authenticated, user-triggered import. It does not make Supabase the runtime source of truth yet.

## Flow

1. User opens `#/account`.
2. User signs in with Supabase Auth if needed.
3. Migration card previews the current legacy household data.
4. User explicitly confirms the import.
5. The browser imports data using the authenticated Supabase client and existing RLS policies.
6. Legacy localStorage, Netlify Blob sync, and household-token routing remain active.

## Migrated

- Built-in plants, mapped through `plant_catalog.legacy_id`.
- Custom plants as `plants.source = 'custom'`.
- `plants.legacy_id` for QR compatibility.
- `households.legacy_public_token` when an active household token exists.
- Removed built-in plants as `plants.is_removed = true`.
- Notifications enabled flag and watering intervals.
- Care records into `plant_care_records`.
- Diagnosis history into `plant_diagnostics`, `diagnostic_observed_symptoms`, and `diagnostic_recommended_steps`.
- Report recipient/last dates into `household_report_settings` when present.
- Plant and diagnostic images into `plant-images` / `diagnostic-images` when safe.

## Not Migrated Yet

- Existing web push subscription payloads are not imported into Supabase yet.
- Supabase is not used as the primary app storage after import.
- Legacy Netlify Blob data is not deleted.
- RevenueCat, real payments, and native push are not enabled.

## Safety Guarantees

- Import is opt-in and requires explicit confirmation.
- No service role key is used in frontend code.
- All writes use the authenticated Supabase client and RLS.
- Re-running import reuses plants by `legacy_id` and avoids duplicate plant rows.
- Base64 images are not stored in database columns.
- Failed image uploads fall back to legacy storage.
- Personal notes are sanitized before Supabase writes.

## Known Limitations

- Diagnosis import is best-effort and skips duplicates by legacy diagnostic ID.
- Images require existing Supabase Storage buckets and compatible policies.
- If a built-in plant has no `plant_catalog.legacy_id` match, it is skipped until catalog data is fixed.
- Push subscriptions need a dedicated token migration design before native push rollout.

## Next Source-of-Truth Step

After this import is stable, promote Supabase from read-only preview to the source of truth for authenticated migrated households. That switch should be separate from this read-through phase and must keep rollback available until write parity is proven.

## Supabase Read-Through Preview

Supabase reads are guarded by `VITE_ENABLE_SUPABASE_READS` and default off. With the flag off, the app continues to use legacy localStorage plus Netlify Blob sync exactly as before.

### Enable locally

1. Configure the normal browser Supabase env vars:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
2. Add `VITE_ENABLE_SUPABASE_READS=true` to `.env.local`.
3. Start the app with `npm run dev`.
4. Sign in with an account that already imported its legacy household.
5. Open `#/account` and check `Data source`.

### Enable read/write source-of-truth mode locally

Read/write mode requires read-through mode:

```bash
VITE_ENABLE_SUPABASE_READS=true
VITE_ENABLE_SUPABASE_WRITES=true
```

When both flags are enabled and the signed-in user has a migrated household, Supabase becomes the primary read/write source. Successful writes are mirrored to legacy localStorage and Netlify Blob sync so rollback remains available.

### Expected modes

- `Legacy`: feature flag is off.
- `Supabase preview`: feature flag is on, the user is authenticated, and a migrated household with plant rows was read successfully.
- `Supabase source of truth`: read and write flags are on, the user is authenticated, and a migrated household with plant rows was read successfully.
- `Fallback`: feature flag is on but there is no authenticated migrated household available.
- `Error`: Supabase read failed; the UI falls back to legacy data.

### Compare migrated data

On `#/account`, click `Compare legacy vs Supabase`. The comparison only shows safe aggregate counts:

- plant count mismatch
- care record mismatch
- diagnosis count mismatch
- missing legacy ID references
- hidden/removed plant mismatch

It does not log or display household tokens, notes, image payloads, or secrets.

### Rollback behavior

Rollback is immediate:

1. Remove `VITE_ENABLE_SUPABASE_WRITES=true`, or set it to `false`.
2. Keep `VITE_ENABLE_SUPABASE_READS=true` if you only want read-only preview, or remove it too for full legacy mode.
3. Rebuild/restart the app.

The Account page also has a local `Disable Supabase write mode locally` button. It stores a browser-only rollback override and forces writes back to legacy on that device without changing deployment env vars.

If a Supabase write fails while write mode is enabled, the app saves through the legacy path, shows a non-blocking warning, and falls back away from Supabase reads for that session. Legacy localStorage and Netlify Blob data are never deleted by this mode.

### Known limitations

- Read-through is display-only. Watering, report settings, plant edits, local diagnosis persistence, and Netlify Blob sync still use the legacy path.
- Read/write mode currently mirrors writes to legacy for rollback, so the system intentionally keeps two stores during rollout.
- Supabase plant images are read from Storage public URLs when an image path exists; legacy built-in images remain the fallback.
- Login remains optional. Unauthenticated users always stay on legacy data.
- Payments remain disabled and RevenueCat SDK is still not integrated.
- This phase does not delete, rewrite, or migrate localStorage/Netlify Blob data after import.

### Production cutover checklist

- Confirm RLS policies for `plants`, `plant_care_records`, `plant_diagnostics`, report settings, and Storage buckets in staging.
- Run import for a representative set of households and compare aggregate counts on `#/account`.
- Enable `VITE_ENABLE_SUPABASE_READS=true` first and monitor fallback/error rate.
- Enable `VITE_ENABLE_SUPABASE_WRITES=true` for a limited cohort.
- Verify watering, fertilizing, transplant, notes, custom plants, hidden plants, report settings, and diagnosis create/update read back from Supabase.
- Keep legacy mirroring enabled until rollback has not been needed across the rollout window.
- Only then plan Netlify Blob cleanup as a separate migration.

### Remaining Netlify Blob cleanup steps

- Export or snapshot existing Blob state before deletion.
- Verify every active household has Supabase plant rows with preserved `legacy_id` values.
- Verify care record and diagnostic counts against Supabase aggregates.
- Disable legacy Blob writes in a separate release after Supabase write parity is proven.
- Retain a read-only Blob backup through at least one rollback window.
