# iOS/Android gallery compatibility correction

## Evidence and limits of the diagnosis

The screenshot shows the `8c6b8d2` modal and the public `INVALID_IMAGE` message after iOS Photos selection. It does not expose the original File, browser exception, encoded output, or HTTP response. `INVALID_IMAGE` could arise from an empty read, invalid output geometry/JPEG structure, server JPEG validation, or the AI provider's image decoder. The screenshot therefore does **not** prove a HEIC failure, stream failure, or a particular iOS browser defect. No physical iPhone or Android device was attached during this work.

The current implementations, including `validatedImageInput.ts`, both shared picker/hook flows, regression fixtures and prior reports, were inspected. The following compatibility gaps were established in the code and reproduced by targeted tests:

- A recognized format with different declared MIME metadata was rejected before decoding. Supported actual bytes now determine the decoder, including JPEG/PNG exports carrying stale HEIC metadata, generic/empty metadata, and incorrect metadata. Unknown or unsupported actual signatures remain rejected.
- A failed stream had no independent read path; an empty stream was immediately classified as invalid input. A controlled stream failure and an empty stream with stale zero size now recover through one bounded FileReader attempt. Partial reads, timeouts, cancellation and oversized streams do not retry or accept partial bytes.
- HEIC/HEIF conversion depended entirely on the browser's decoder. A real iPhone 13 Pro Max HEIC and a real HEIF sample now decode through the actual libheif worker on desktop Chromium and WebKit where native decoding is unavailable. This is real codec execution, not mocked pixel data or MIME metadata.
- HTML decoding used rendered `width`/`height` instead of intrinsic pixel dimensions. A controlled zero rendered width previously produced an invalid-image result despite loaded pixels; the pipeline now uses `naturalWidth`/`naturalHeight` and reports genuine zero-pixel decode failures as decode errors.
- Fresh JPEG output was checked less strictly than the server contract: encoder APP1/IPTC/comment metadata could reach safety validation and be rejected there. Tests inject APP1 into actual encoder output and verify that normalization removes it before the **unchanged** strict server validator. This models a metadata-bearing encoder; it is not evidence that this user's iOS encoder produced those bytes.
- Small original JPEGs could bypass pixel normalization after decoding. All selected originals now pass through the common canvas encoder. Upload preparation still avoids recompressing the already normalized result. A regression verifies removal of an original JPEG comment after the first scan as well as normal header metadata.

The exact cause of the reported handset failure remains unconfirmed pending a device trace or reproduction. The corrections address demonstrated compatibility gaps without weakening validation or labeling the phone's image as corrupt based only on its MIME metadata.

The controlled stream-failure regression was also executed against the immutable capture-service source from `8c6b8d2`: it failed with `IMAGE_READ_FAILED` before the independent read path. The current full Chromium/WebKit suites pass that same case. This is a before/after client regression, not a reproduction of the user's iCloud/Photos provider.

## Processing and source selection

The picker, shared modal architecture, appearance, name/notes fields and business handlers are preserved. The web input requests `image/jpeg,image/png,image/webp,application/octet-stream`: JPEG-first compatible Photos exports, with opaque provider Files access retained. This remains a hint rather than a trust boundary. [WebKit documents accept-list-dependent transcoding](https://bugs.webkit.org/show_bug.cgi?id=292350); exact Photos/Files behavior still needs device testing. Native Capacitor continues using its existing camera/gallery prompt.

Streaming remains the first read for browser File inputs, preserving the Android metadata-avoidance correction. An independent FileReader attempt is allowed only when the stream failed or finished empty without yielding bytes. Declared size above the original limit prevents the retry; progress and actual result length are bounded too. A stale zero size does not by itself reject readable bytes. Each read has cancellation and a 30-second timeout. Successful streams are not reread. Partial streams fail closed.

HEIF detection supports bounded leading padding, extended `ftyp` lengths and HEIC/HEIF brands; AVIF is distinguished and rejected as unsupported by this pipeline. Native ImageBitmap and HTML decoders are tried before software conversion. Their failed resources are released before the worker starts. The primary HEIF image is selected; container orientation is applied by libheif. Software decoding is serialized, limited to **16,777,216 decoded pixels**, and terminated on cancellation, error, completion or a 60-second deadline. The worker and library buffers are discarded before the main-thread rendering canvas is allocated. Larger images can still use a supporting native decoder; otherwise a localized `IMAGE_DECODE_LIMIT` requests a resized JPEG/PNG export. This resource limit is separate from the compressed input size.

Every accepted original is rendered and encoded as JPEG, longest side at most 1600 px, initial quality 0.85, with the existing five bounded compression attempts. Original size remains 15 MiB, preferred output below 1 MiB, processed output at most 2 MiB. Header EXIF/XMP/IPTC/comment segments from fresh encoder output are removed, then JPEG structure, dimensions and metadata are validated before the data URL/preview is returned. Invalid images are never returned as originals to bypass normalization. Existing transport allowances, private Storage, household authorization, AI safety validation and write/retry integrity remain unchanged.

## Device diagnostics

Normal production UI and logging remain unchanged unless the device explicitly opts in. Open:

`https://plantiecare.com/?imageDebug=1#/`

After selection failure, the existing status gains a safe reference such as `[heic-convert/IMAGE_DECODE_FAILED]` or `[safety-validation/INVALID_IMAGE]`. This distinguishes conversion/output failure from a server rejection without requiring remote developer tools. Remove `imageDebug=1` to disable it; the flag is not persisted.

Development or opt-in console diagnostics contain only runtime, categorical browser/platform, stage, allowlisted declared/detected MIME, reported original byte size, public error code and allowlisted exception name. They never log image bytes, names, URLs, raw user agents, provider messages/stacks, accounts or credentials. Third-party worker output is suppressed. Diagnostics stay local to the device; no telemetry endpoint or new database collection was added. Remove the temporary opt-in facility after the affected devices are verified.

Relevant stage mapping:

| Stage | Interpretation |
| --- | --- |
| `file-read`, `file-stream-fallback` | Provider bytes/independent read; empty actual content, read access, size or timeout |
| `format-check` | Actual signature recognition; unsupported format rather than MIME disagreement |
| `snapshot-create` | Owned Blob creation |
| `image-decode` | Native bitmap/HTML decoding and intrinsic pixel dimensions |
| `heic-convert` | Software HEIC/HEIF decode or its resource limit |
| `jpeg-encode` | Canvas rendering/JPEG compression |
| `output-validate`, `output-read` | Canonical output JPEG checks or data URL read |
| `preview-create` | Owned preview URL creation |
| `safety-validation` | Existing server validator/provider response after local processing |

## Validation

- `npm run check`: type checking, the complete automated suite (**561 reported executions across 39 Node runs**, including repeated scripts), and production build passed. The final input hint adjustment was subsequently checked with App wiring tests, both browser suites and another production build.
- Image unit suite: **35 tests passed**, covering actual-byte/MIME independence, size/timeouts, HEIF brand parsing, metadata removal versus the exact server parser, malformed input, localization and opt-in diagnostic privacy.
- `npm run test:image-browser`: **214 assertions passed** in isolated desktop Chromium using installed Edge.
- `npm run test:image-webkit`: **214 assertions passed** in Playwright's desktop WebKit 26.5 Windows port. Chromium results are not presented as Safari results, and this port is not physical iOS Safari/Chrome/Opera.
- Both engines execute the same real File/Blob/stream/FileReader/arrayBuffer, bitmap/HTML, canvas, worker/WASM and React pipeline. FileReader, arrayBuffer and stream produce identical SHA-256 results for the three real codec fixtures. Real iPhone portrait geometry is 1200 × 1600 after normalization. All normalized fixture outputs pass the exact shared server JPEG contract.
- Real HEIC first selection → corrupted second selection → successful HEIC retry is exercised through the shared hook and preview. A cancelled real HEIC decode terminates its actual worker. Existing camera/gallery prompt, duplicate selection, replacement, form preservation, modal/household switching, stale work, resource cleanup, permission, corrupt/compression, 15 MiB and mobile layout checks remain covered.
- External safety HTTP and native Camera boundaries are substituted. The HTTP substitute runs the actual shared JPEG validator before returning its controlled AI result. Real authorized production Storage/AI upload and the affected user's session were **not** exercised in this turn.
- Strict browser-fixture TypeScript compilation passed. Android Capacitor sync and `:app:assembleDebug` passed with Android Studio's JDK. There were no attached Android devices/emulators. Physical iOS/Android Photos/Files/iCloud behavior, native camera permissions and memory pressure remain pending.
- `git diff --check` passed. No lint/formatter command is configured. Existing Vite large-chunk and Gradle deprecation warnings remain. `npm audit` reports four advisories in other existing dependencies; neither added dependency is listed.

## Dependencies, files and rollout

`libheif-js@1.23.5` adds the missing maintained HEIC decoder; the existing dependencies did not provide one. Its bundled WASM runs only in the separately loaded worker (approximately 2.04 MB uncompressed), after native decoding fails. No CDN or photo-upload conversion service is used. `playwright@1.61.1` is a development dependency to run the same suite in a second browser engine. Install the WebKit test binary with `npx playwright install webkit`. License/source notices are served in `public/third-party`; public real-image fixture provenance and CC BY-SA terms are in `tests/fixtures/images/README.md`.

Runtime files: `src/components/ImageSourcePicker.tsx`, `src/hooks/useImageSelection.ts`, `src/lib/imageCaptureService.ts`, `src/lib/imageFormats.ts`, `src/lib/heicDecoder.ts`, `src/lib/heicDecode.worker.ts`, `src/lib/libheif.d.ts`, `src/lib/imageUploadConfig.ts`, `src/lib/imageUploadErrors.ts`, `package.json`, `package-lock.json`, and third-party notices.

Verification: the shared browser runner, both image browser fixtures, image capture/validation unit tests, three real image fixtures with attribution/license, and these reports. No App layout, CSS, database migration, authorization rule or server validator was changed. Release through the existing web main-branch deployment; native installs need a rebuilt/released app. A passing desktop suite is not sufficient to mark the reported handset issue resolved.
