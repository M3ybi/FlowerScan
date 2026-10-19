# Supabase Storage buckets

Image storage is private and household-scoped. The app stores only database `image_path` values and creates short-lived signed URLs when it needs to display private Supabase images.

Apply the complete ordered migration history after the core schema, including
`20260612110000_require_validated_image_uploads.sql`,
`20261016130000_normalized_image_bucket_limits.sql`, image admission and
`20261019100000_recheck_upload_membership_after_lock.sql`. The original bucket
migration alone does not describe the current upload authorization or limits.

## Buckets

### `plant-images`

- Purpose: custom plant photos.
- Public: `false`.
- Max new-object size: 2 MiB (2,097,152 bytes).
- Allowed MIME types: `image/jpeg`.
- Path convention: `plant-images/{household_id}/plants/{image_id}/original.jpg`.

### `diagnostic-images`

- Purpose: photos attached to AI diagnosis records.
- Public: `false`.
- Max new-object size: 2 MiB (2,097,152 bytes).
- Allowed MIME types: `image/jpeg`.
- Path convention: `diagnostic-images/{household_id}/diagnostics/{image_id}/image.jpg`.

## Policies

The ordered migrations configure policies on `storage.objects`:

- Authenticated household members can read objects whose first path segment is their household ID.
- Direct authenticated insert/update is denied. Uploads pass through the JWT- and
  membership-checked `upload-validated-image` function, safety validation and
  serialized admission before its service-role Storage write. Active collaborating
  Viewers retain permitted household content and image deletion access.
- Invalid paths are denied by a UUID parser helper.
- Anonymous users cannot read or write these buckets.

The frontend must use the authenticated Supabase client only. Do not use service role keys in browser or Capacitor code.

Original selection accepts up to 15 MiB; client normalization produces a JPEG
with a longest edge of at most 1600 px, targeting below 1 MiB and enforcing a
2 MiB hard limit. Existing stored objects/references are preserved by the bucket
limit update; it does not purge older photos.

## Signed URLs

- Use `createSignedUrl` with a short TTL, currently 5 minutes by default.
- Do not store signed URLs in `plants.image_path` or `plant_diagnostics.image_path`.
- Store only the object path, for example `111.../plants/222.../original.jpg`.

## Manual checks

1. Apply the ordered history in a disposable Supabase project; see [V4 validation](v4-supabase-validation.md).
2. Sign in as a household member.
3. Create or update a custom plant image.
4. Confirm the object is written under `plant-images/{household_id}/plants/{image_id}/original.jpg`.
5. Run diagnosis and save it.
6. Confirm the object is written under `diagnostic-images/{household_id}/diagnostics/{image_id}/image.jpg`.
7. Sign in as another user outside the household and verify reads/writes fail.
8. Verify direct Storage insert/update fails even for active members, while the
   validated upload succeeds for permitted Owners and collaborating Viewers.
