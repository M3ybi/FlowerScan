# Shared plant modals and provider-safe photo reads

## Evidence and root-cause limits

The latest report confirms that Add Plant fails after selection through the phone's Files app. A gallery-only explanation is therefore insufficient. The screenshot does not include a browser exception, original photo or device trace. Its read-error text was also used for unexpected exceptions by `useImageSelection`, so the screenshot alone cannot identify the failing operation.

Two defects were reproduced before their fixes:

1. `preprocessImageFile` accessed `File.size` before reading the selected bytes. A browser regression fixture models an Android provider whose metadata snapshot invalidates the subsequent read: the old sequence throws `IMAGE_READ_FAILED`; the revised sequence succeeds without accessing the File's size metadata. This models [Chromium issue 40123366](https://issues.chromium.org/issues/40123366), which documents snapshot/modified-time failures, including reports outside Google Drive. It does not reproduce the user's physical handset or prove that her provider has the same defect.
2. The broad `.add-plant-form button` selector overrides the shared image picker's layout and gives it the primary orange button appearance. A test using the real form classes and production CSS failed before the fix. The earlier preview fixture omitted those form classes and missed the regression.

An additional incorrect error boundary mapped every unexpected selection exception to `IMAGE_READ_FAILED`. A controlled snapshot-allocation failure now verifies that processing failures are no longer misreported as gallery-read failures.

## File reading and chooser behavior

Browser File inputs with `Blob.stream` are consumed immediately through a bounded stream without reading `size`, `lastModified`, slicing, copying the File object or posting it to a worker first. The limit applies to actual bytes as they arrive. Reading stops and cancels above 15 MiB, on cancellation, or after a 30-second timeout. Chunks are assembled into owned bytes only within the limit; all subsequent decoders and compression attempts use the owned Blob. Empty input is rejected. Other formats and signature/MIME mismatches still fail closed.

[Chromium's Blob implementation](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/fileapi/blob.cc) creates its stream from the Blob data handle, whereas slicing calls `size()`. This is why streaming was chosen over another clone/slice fallback. Older browsers without streaming retain the existing size-bounded FileReader path; they do not receive the metadata-avoidance behavior. Stable in-memory/native Blobs also retain that path.

Both workflows have one photo control. On the web it synchronously opens one browser file input, with no custom source menu or forced camera capture. `accept="image/*,application/octet-stream"` permits opaque provider exports and routes current Android Chromium to the external camera/Files chooser rather than its media-only picker. [Chromium's chooser source](https://github.com/chromium/chromium/blob/main/ui/android/java/src/org/chromium/ui/base/SelectFileDialog.java) documents this distinction and constructs available camera intents alongside Files. Exact choices depend on the browser, OS and installed applications; desktop file dialogs do not promise camera capture. Actual byte validation still enforces supported images even when the dialog allows other files.

The input stays mounted and enabled during its read; the visible photo button is disabled while processing. It resets after the operation settles, permitting the same file to be chosen again. Empty/cancelled selections preserve the form and previous photo. Browser code never invokes the Capacitor camera plugin. Native Capacitor uses `CameraSource.Prompt` with localized camera/gallery/cancel labels and the existing serialized picker queue. Its URI fetch timeout covers the response body as well as headers.

## Shared UI and preserved behavior

`PlantActionModal`, `PlantImagePreview` and `PlantFormStatus` provide the diagnosis design baseline to both workflows. The shared shell supplies the title, description, close control, focus wrapping/restoration, background scroll lock and visual-viewport sizing for keyboard changes. Its keyboard handler defers to a later modal, such as the upgrade dialog. Processing can be cancelled by closing; an active save/AI submission prevents dismissal.

Add Plant has shorter descriptions in all five languages, the existing green primary button, the shared dashed photo control and shared status presentation. The dominant English Premium banner was removed. Preview frames share a bounded 4:3 ratio and contain the image without cropping. Name, diagnosis notes, confirmation/rejection, subscription limits, household authorization, AI safety checks, save ordering and upload recovery remain in their existing handlers. Diagnosis submission additionally refuses an in-flight image operation.

Original images remain limited to 15 MiB. Normalized JPEGs remain at most 1600 px on the longest side, initially quality 0.85, preferred below 1 MiB and hard-limited to 2 MiB. Existing bounded compression attempts, orientation handling, content verification, metadata removal and encoded transport allowances are unchanged. HEIC/HEIF must actually decode through an available platform decoder; they are never merely renamed JPEG.

## Diagnostics and privacy

Processing errors retain the stage (`input-check`, `file-read`, `format-check`, `snapshot-create`, `image-decode`, `jpeg-encode`, `output-validate`, `output-read`, `preview-create`, `native-picker`, `native-read`, or `safety-validation`). Native selection, permission, read, format, decode, compression, safety validation, upload and network failures have distinct public codes/messages. Existing Add Plant and diagnosis handlers continue distinguishing AI and save/upload failures.

Development diagnostics log stage, runtime, allowlisted MIME, size and an allowlisted technical exception name/public code. The underlying exception is retained internally for classification but its message and stack are never logged or displayed. Production diagnostic logging is disabled. Tests verify that filenames, unexpected MIME strings, provider messages, URLs and photo bytes cannot enter these logs. Failures preserve entered fields and the last successful image, and release the operation lock for immediate retry.

## Validation

- `npm run check`: passed type checking, the complete existing automated suite (557 reported executions across 39 Node runs), and the production build. Some scripts repeat coverage. The subsequently added stream-timeout regression was run with the final image suite: all 32 image tests passed.
- `npm run test:image-browser`: 161 assertions passed in isolated desktop Chromium using the real React components, File/Blob, streams, FileReader, bitmap/HTML decoders, canvas and production CSS. Validation HTTP and the native Camera plugin are substituted external boundaries; the provider metadata defect, provider read error and allocation failure are explicitly modeled, not actual Android provider failures.
- Coverage includes repeated browser selections/replacements, camera/gallery native prompt wiring, empty/cancelled choices, denied permissions, retry after read/validation failure, an actual 15 MiB streamed File, stopping oversized streams without reading the rest, stream cancellation, fallback without streaming, JPEG/PNG/WebP, EXIF orientation checked by pixels, 24-megapixel input, HEIC rejection without a decoder, compression failures, stale modal/household work and URL/bitmap cleanup.
- Shared modal checks exercise Add Plant and diagnosis in English/Slovak at 390px, actual Add Plant form classes, matching picker styles, 4:3 previews, focus/close behavior, scroll restoration and a simulated keyboard-sized visual viewport. The mobile screenshot was inspected visually. This is not a physical keyboard/device test.
- Strict TypeScript compilation of both browser fixtures passed. Capacitor Android sync and `:app:assembleDebug` passed with Android Studio's bundled JDK.
- `git diff --check` passed. No lint or formatter command is configured. No dependency/lockfile, database, Storage policy or Edge Function change was needed. Existing Vite chunk-size and Gradle deprecation warnings remain.

## Files and rollout

Runtime: `src/App.tsx`, `src/components/PlantActionModal.tsx`, `src/components/ImageSourcePicker.tsx`, `src/hooks/useImageSelection.ts`, `src/lib/imageCaptureService.ts`, `src/lib/imageUploadErrors.ts`, `src/lib/i18n.ts`, `src/styles.css`.

Verification: `scripts/test-image-processing-browser.mjs`, `tests/add-plant-image.test.mjs`, `tests/fixtures/image-processing-browser.ts`, `tests/fixtures/image-selection-browser.tsx`, `tests/image-capture.test.ts`, `tests/image-upload-validation.test.ts`, `tests/mobile-ux-cleanup.test.ts`, and these reports.

Release through the normal main-branch web deployment. Native installs require a rebuilt/released Android app. No Android devices or emulators were attached (`adb devices` returned an empty inventory), so physical Android Chrome, native camera/gallery, the affected user's exact Files provider, real supported HEIC decoding and low-memory termination remain unverified. No production user data or permissions were modified. The client cannot recover bytes that the OS never permits it to read; do not claim the reported handset is fixed until it passes a real selection test.
