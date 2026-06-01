# Supabase Storage buckets

Image storage is private and household-scoped. The app stores only database `image_path` values and creates short-lived signed URLs when it needs to display private Supabase images.

Apply `supabase/migrations/20260601093000_storage_image_buckets.sql` after the core Plantie schema migration.

## Buckets

### `plant-images`

- Purpose: custom plant photos.
- Public: `false`.
- Max file size: 8 MB.
- Allowed MIME types: `image/jpeg`.
- Path convention: `plant-images/{household_id}/plants/{plant_id}/original.jpg`.

### `diagnostic-images`

- Purpose: photos attached to AI diagnosis records.
- Public: `false`.
- Max file size: 8 MB.
- Allowed MIME types: `image/jpeg`.
- Path convention: `diagnostic-images/{household_id}/diagnostics/{diagnostic_id}/image.jpg`.

## Policies

The migration creates policies on `storage.objects`:

- Authenticated household members can read objects whose first path segment is their household ID.
- Household editors/owners can insert, update, and delete objects in their household path.
- Invalid paths are denied by a UUID parser helper.
- Anonymous users cannot read or write these buckets.

The frontend must use the authenticated Supabase client only. Do not use service role keys in browser or Capacitor code.

## Signed URLs

- Use `createSignedUrl` with a short TTL, currently 5 minutes by default.
- Do not store signed URLs in `plants.image_path` or `plant_diagnostics.image_path`.
- Store only the object path, for example `111.../plants/222.../original.jpg`.

## Manual checks

1. Apply the migration in a local Supabase project.
2. Sign in as a household member.
3. Create or update a custom plant image.
4. Confirm the object is written under `plant-images/{household_id}/plants/{plant_id}/original.jpg`.
5. Run diagnosis and save it.
6. Confirm the object is written under `diagnostic-images/{household_id}/diagnostics/{diagnostic_id}/image.jpg`.
7. Sign in as another user outside the household and verify reads/writes fail.
