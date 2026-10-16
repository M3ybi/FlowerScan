# Image upload pipeline and size mismatch fix

## Root cause

The client accepted 8 MiB originals, while upload, safety validation, care generation and diagnosis rejected data URLs longer than 1,600,000 characters. Base64 adds approximately one third to the binary size, so that transport restriction admitted only about 1.14 MiB of decoded image data. The Storage buckets independently allowed 8 MiB. JPEG preprocessing also returned the original file if resizing failed, bypassing normalization and metadata removal.

The pre-change upload handler was executed in isolation against a valid 2 MiB JPEG: it returned HTTP 400 for a 2,796,227-character data URL. The updated handler returns HTTP 200 for that same fixture. Provider/authentication/storage boundaries were mocked in this reproduction; no real photo was uploaded.

## Contract and processing

`src/lib/imageUploadConfig.ts` is the shared client/Edge contract. UI messages use MB; byte limits use MiB, consistently with the repository's previous limits.

| Property | Value |
| --- | --- |
| Original input | At most 15,728,640 bytes (15 MiB) |
| Input MIME types | JPEG/JPG, PNG, WebP; signatures must match |
| Normalized output | JPEG, at most 2,097,152 bytes (2 MiB) |
| Preferred output | Under 1,048,576 bytes (1 MiB), when the initial encode achieves it |
| Longest output side | At most 1600 px; aspect ratio preserved; no upscaling |
| Initial quality | 0.85 |
| Maximum attempts | Five, all encoded from the same decoded original |
| Later attempts | Quality 0.75, then 0.65; if needed, dimensions reduced to 80% and 64% at quality 0.65 |
| Minimum quality | 0.65; no silent degradation beyond it |
| Maximum base64 payload | 2,796,204 characters |
| Maximum JPEG data URL | 2,796,227 characters, including the prefix |
| Maximum image request body | 2,812,611 bytes, including a bounded 16 KiB JSON/metadata allowance |

The first result within 2 MiB is kept, even if it is between 1 and 2 MiB. This preserves quality and avoids unnecessary recompression merely to reach the preferred size. If all attempts exceed the hard limit, processing fails clearly; the original is never uploaded as a fallback.

Processing decodes asynchronously once, uses EXIF-aware orientation, resizes into a bounded canvas, and asynchronously encodes JPEG. It reads the successful encoded Blob as base64 rather than encoding the canvas a second time. Temporary canvases, decoded bitmaps and object URLs are released. Canvas output removes private metadata; backend validation also rejects JPEG EXIF/IPTC/comment segments. Already normalized, metadata-free JPEGs avoid another lossy encode during upload preparation.

Orientation follows [the browser's `from-image` decoding contract](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap). The HTML image fallback was separately tested. Native capture explicitly requests orientation correction and uses Capacitor's JPEG conversion; [the Camera API documents native JPEG output](https://capacitorjs.com/docs/apis/camera). Generic native response MIME types are inferred from actual bytes and then decoded, rather than relabeled blindly. Supplied Android file-input selections are processed directly instead of reopening the native picker. The diagnosis gallery button also now reaches the native picker when no browser File is supplied.

## Backend and authorization

All four Supabase image endpoints use `_shared/imageUpload.ts`. It bounds declared and streamed request size before JSON parsing or base64 decoding. Validation checks base64 length/padding, actual decoded bytes, JPEG markers and dimensions, and private metadata. Corrupted image errors returned by the AI decoder are mapped to a safe invalid-image response.

| Failure | HTTP / public code |
| --- | --- |
| Processed image or transport too large | 413 / `IMAGE_TOO_LARGE` |
| Unsupported or mislabeled recognized format | 415 / `UNSUPPORTED_IMAGE_FORMAT` |
| Corrupt/unreadable image, malformed payload, invalid dimensions or remaining private metadata | 400 / `INVALID_IMAGE` |
| AI safety rejection | 422 / `IMAGE_VALIDATION_FAILED` |
| Authentication required | 401 / `AUTHENTICATION_REQUIRED` |
| Missing active household plant-management permission | 403 / `HOUSEHOLD_ACCESS_DENIED` |
| Storage failure | 502 / `IMAGE_UPLOAD_FAILED` |
| Network failure / timeout | 502 / `IMAGE_NETWORK_FAILED`; 504 / `IMAGE_NETWORK_TIMEOUT` |
| Provider temporarily unavailable | 503 / `IMAGE_SERVICE_UNAVAILABLE` |

Original-size and compression failures have separate client codes. English and Slovak messages are selected by the app's language; backend implementation details are not displayed. Photo help and upload progress text were updated in all five existing UI dictionaries. Existing household authorization, private storage, UUID object paths and mandatory server-side AI safety validation remain in force.

Compatibility Netlify image handlers use the same transport contract. Legacy plant/history sanitizers retain complete valid-size data URLs and reject oversized entries instead of truncating base64 into unreadable images. Legacy helper functions and signed-image care refreshes use the same preprocessing pipeline.

## Retry and UI behavior

The form remains populated when processing/upload fails. A failed replacement retains the previous preview. Synchronous guards prevent overlapping capture/submission work. The pending plant ID survives a failed save, so a retry can recover the same record rather than generate another plant ID. A bounded cache of hashes and UUIDs reuses object paths for image retries without retaining photos in the cache. Existing image cleanup and committed-write recovery remain active.

The retry cache and pending form ID are session-memory state; they do not promise cross-restart recovery of an unsaved form. An abrupt client termination after storage succeeds can still leave an unreferenced file, as documented in the previous household audit. No existing production files were deleted.

## Modified files for this request

Client/configuration:

- `src/lib/imageUploadConfig.ts`
- `src/lib/imageUploadErrors.ts`
- `src/lib/validatedImageInput.ts`
- `src/lib/imageCaptureService.ts`
- `src/lib/imageStoragePaths.ts`
- `src/lib/plantieRepository.ts`
- `src/lib/supabaseSourceOfTruth.ts`
- `src/lib/legacyMigrationService.ts`
- `src/lib/backendConfig.ts`
- `src/lib/i18n.ts`
- `src/App.tsx`
- `src/utils/customFlower.ts`
- `src/utils/diagnostics.ts`
- `src/utils/imageUploadValidation.ts`

Backend/storage:

- `supabase/functions/_shared/imageUpload.ts`
- `supabase/functions/upload-validated-image/index.ts`
- `supabase/functions/validate-plant-image/index.ts`
- `supabase/functions/plant-care-ai/index.ts`
- `supabase/functions/plant-diagnosis-ai/index.ts`
- `netlify/functions/plant-care-ai.ts`
- `netlify/functions/plant-diagnosis-ai.ts`
- `netlify/functions/_shared/diagnostics.ts`
- `netlify/functions/_shared/storage.ts`
- `supabase/migrations/20261016130000_normalized_image_bucket_limits.sql`
- `supabase/tests/normalized_image_bucket_limits.sql`

Tests/execution/documentation:

- `tests/image-capture.test.ts`
- `tests/image-upload-validation.test.ts`
- `tests/diagnosis-flow.test.ts`
- `tests/diagnostics.test.ts`
- `tests/edge-image-diagnosis.test.mjs`
- `tests/product-redesign.test.ts`
- `tests/fixtures/imagePayload.ts`
- `tests/fixtures/image-processing-browser.ts`
- `scripts/test-image-processing-browser.mjs`
- `scripts/test-database-audit.mjs`
- `package.json`
- `docs/image-upload-pipeline.md`

Earlier household/subscription changes remain in the working tree. No dependency or lockfile change was added by this request. Previously applied migrations were not edited.

## Validation results

- `npm run check`: passed TypeScript checks, 545 automated test executions across the existing runner, and the production web build. Some billing/webhook checks are repeated by that runner. Targeted image/backend tests were rerun after the final changes.
- `npm run test:image-browser`: 23 real Chromium browser checks passed. Includes actual JPEG/PNG/WebP decoding/conversion, 8 MiB JPEG and 14.9 MiB PNG inputs, 1600 px resizing, aspect ratio/no upscaling, output-size checks, UI task yielding, portrait rotation verified by pixel positions, metadata removal, corrupt/MIME-spoofed/oversized originals, HTML decoding fallback, and Android file-input routing with the runtime boundary substituted. The large size-boundary fixtures contain valid image data plus harmless padding; they do not simulate every camera's large-image compression characteristics.
- `npm run test:edge-images`: 14 handler tests passed, including a full 2 MiB payload through upload, safety validation, care and diagnosis; bounded request reading; byte/format errors; authorization; AI/storage failure; timeout and corrupt-image classification; and reservation cleanup. Provider, authentication and Storage API boundaries are mocked.
- `npm run test:image-storage`: passed against the linked Supabase project inside BEGIN/ROLLBACK. Confirms both private buckets enforce JPEG / 2 MiB with the migration and retain the existing household read policy. No production bucket settings were permanently changed.
- Browser fixture TypeScript compilation passed independently.
- Final web build, Capacitor Android sync and `:app:assembleDebug` passed using Android Studio's bundled JDK.
- `git diff --check`: passed. There is no configured lint script in this repository; no new lint dependency was introduced. Vite's existing large-bundle warning remains.

Not executed: real phone camera/gallery/HEIC imports, actual affected-user sessions, live OpenAI moderation/Storage upload/deletion, or installation of the APK on a connected device. No device/emulator is attached. Supabase credentials were available for the rollback-only bucket integration test. Standalone Deno typechecking was unavailable; actual Edge handler code was bundled and executed in the handler tests.

## Deployment

The three pending migrations and four image Edge Functions were deployed to the linked production project on 2026-10-16 during the follow-up investigation below. The following commands describe the required rollout order for future releases.

1. Deploy the four image Edge Functions with the shared helper and source configuration included:
   ```powershell
   npx supabase functions deploy upload-validated-image
   npx supabase functions deploy validate-plant-image
   npx supabase functions deploy plant-care-ai
   npx supabase functions deploy plant-diagnosis-ai
   ```
   Keep authenticated access and existing server secrets. Do not expose service-role or AI credentials to the client.
2. Release the web bundle and, if used, Netlify compatibility functions. Rebuild and release Android with the new assets.
3. Apply `20261016130000_normalized_image_bucket_limits.sql` through the normal migration workflow (`npx supabase db push --linked`). **Review every pending migration first:** this working tree also contains earlier household/subscription migrations. Deploying the diagnosis function also requires its matching service-role reservation-settlement migration from that earlier work, as described in the household audit.
4. Existing larger stored images remain readable; the bucket limit affects new writes. Older clients that bypass normalization must be updated. Verify the final flow with isolated test plants and photos on a real Android device and desktop/mobile browsers.

No new runtime configuration values are required. Limits are controlled by the shared contract and the new bucket migration. Native HEIC/device-specific conversion depends on the platform Camera implementation; unsupported/unconvertible formats fail clearly rather than being renamed into JPEG. Native original-size validation applies to the imported JPEG returned by Capacitor, which does not expose the original unconverted asset's byte count through this API.

## Follow-up: mobile web photo failures, 2026-10-16

The affected user's screenshots show no preview after photo selection. She reports that every photo fails. A read-only production check confirmed active household membership and Premium; account permissions were not changed. The web release contained the new image limit while production still had the older image functions and none of the three matching database migrations.

Two browser regressions were reproduced before fixing them:

- With `AbortSignal.timeout` unavailable, the actual image-validation request path threw `TypeError` before reaching the mocked HTTP boundary. Image validation, upload and care-photo retrieval now use an `AbortController` timer with cleanup, preserving cancellation on older mobile browsers.
- With `createImageBitmap` present but rejecting a valid image, processing returned `INVALID_IMAGE` without trying the HTML decoder. Processing now attempts the existing HTML decoder after a bitmap failure, retaining metadata stripping and JPEG normalization.

These are confirmed compatibility defects; the screenshots alone do not prove which one occurred on her device. No original failing photo, device browser version or affected-user session was available.

Production validation used disposable Auth accounts without sending emails and an isolated Premium household with a non-owner active member. Real AI safety validation, a full 2 MiB plant upload, a diagnosis-photo upload, authorized private Storage downloads and care generation succeeded. All temporary objects, households and accounts were removed through supported APIs. No existing user content or permissions were modified.

The first live diagnosis request returned invalid JSON. The diagnosis prompt now requests bounded concise output and allows 2400 output tokens rather than 1200. Explicitly incomplete/failed provider responses return a safe service error and release reservations. Output truncation was a suspected cause, not confirmed from provider diagnostics. After deploying this adjustment, the complete live smoke test passed again: validation, both uploads and private reads, care generation and diagnosis all returned HTTP 200. Cleanup of all synthetic objects and records succeeded.

Verification: `npm run check` passed after the browser fixes (547 automated test executions, typecheck and build); the additional diagnosis regression brings the targeted Edge suite to 15 passing tests. All 26 Chromium image checks and both rollback-only database suites passed. New timer tests verify cancellation and cleanup after success/failure. Real Android browser verification by the affected user remains necessary.
