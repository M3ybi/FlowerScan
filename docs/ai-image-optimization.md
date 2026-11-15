# Image pipeline and Step 3 boundaries

Starting main: `f5380f1e8bbd338d3c893a9ce58918ea432c8eeb`. The guarded production backend before this work was `06caac5052d30bed57c98adea50941e7bdbe1e25`. See [release evidence](ai-step3-production-release.md) for deployed revisions and limitations.

## Current execution paths

`ImagePickerField` → `useImageSelection` → `imageCaptureService` → authenticated `validate-plant-image` → `plantImageValidation` → `runAiOperation` → service-only database admission/reservation → one OpenAI Responses attempt → measured settlement/replay. Care and diagnosis use the same adapter. `upload-validated-image` reauthorizes the household, verifies normalized JPEG bytes, reuses eligible safety evidence, reserves an upload intent, writes private Storage and binds the plant image hash. Plant/diagnosis RPCs then persist records. Legacy Netlify inference handlers remain disabled (410).

Original files are bounded at 15 MiB, decoded using the existing web/native/HEIF recovery paths, oriented, stripped of private metadata and normalized to JPEG at at most 1600px/2 MiB without upscaling. Native camera/gallery access remains Capacitor's existing implementation. The storage image and ordinary inference image remain the **same representation**. No new codec/native dependency, cropping, model change or quality reduction is deployed to ordinary users.

## Journey call graph

Counts below assume eligible authorization, a safe previously unseen photo and successful provider output. A replay creates no provider-attempt row. Database/Storage work is not inference.

| Journey | Execution | New paid attempts |
|---|---|---:|
| Add New Plant | browser normalize → safety → initial identification/care → upload with safety reuse → create plant | 2 (1 safety + 1 combined care/identification) |
| Plant Looks Unwell | normalize → safety → diagnosis | 2; 1 if identical recent safety already exists |
| Save diagnosis | upload reusing recent safety → create diagnostic | 0 additional within safety window |
| Manual care refresh | stored JPEG fetch/verification → authorized refresh → optional result persistence | 1; identical completed request/day replays |
| Replace image | normalize → safety → upload reuse → update reference | 1; 0 if exact bytes recently validated by same actor |
| Save generated plant | upload reuse → create plant using completed operation | 0 additional; expired safety adds 1 |
| Retry network failure before inference starts | same identity → admission or replay | 0 until a new admitted attempt actually starts |
| Lost server response after completion | same identity → completed-result replay | 0 additional |
| Lost/uncertain provider outcome | same identity → retained uncertain result/error; financial exposure held | no automatic additional attempt; cannot claim zero billed cost |
| Reopen unfinished creation | preserved request/form → operation replay → save | 0 extra inference while result/evidence remains eligible; UI draft availability is session dependent |
| Select same image again | browser normalization → same bytes/prompt/user safety lookup | 0 within 5 minutes; separately recompressed/different bytes require validation |
| Upload after safety expiry | household authorization → fresh high-detail safety → private upload | 1 |

Initial care results last 24 hours, diagnosis 15 minutes, safety 5 minutes; refresh identity additionally includes the UTC date. These periods are unchanged. Completed replay still requires current authorization and product rules. A different household must pass its own authorization even when user-bound safety is reusable. A new explicit retry cannot erase prior provider cost or uncertain exposure.

## Implemented changes

* Reuse the exact owned immutable normalized Blob and its existing encoded data URL during save. Provenance is private to `imageCaptureService`, not client-supplied safety evidence. Unknown Blobs still undergo byte/header/privacy checks. Reverse lookup retains at most two strings for 120 seconds, uses weak Blob references, and falls back safely when WeakRef is absent. Selection disposal removes its references. This eliminates repeated conversion, not the required initial decode/compression or server verification.
* Project image URLs to SHA-256 placeholders while fingerprinting instead of cloning the entire base64 payload first. Immutable Step 2 comparison tests prove identical ordinary provider payload and fingerprint.
* Centralize the unchanged safety prompt/schema. Revalidate cached positive data using current decision rules. Optional signed receipts now bind policy/model/preprocessing and reject incompatible evidence. Production signing remains unconfigured because database reuse already avoids paid duplicate validation.
* Add profile, encoded-byte and detail metadata to operation accounting. Historical byte sizes remain unknown. Service-only wrappers preserve original Step 2 routines, controls, prices and settlement.
* Add a default-off, actor-allowlisted token benchmark endpoint. Exact image hashes/dimensions/bytes/profile/model/schema are registered privately by an operator. It cannot grant an upload receipt. Its low-detail classifier namespace cannot replay into ordinary validation. Aggregate attempts, measured spend, uncertain exposure and pending reservations share one run budget, including normal smoke journeys by its registered actors: at most 50 attempts/$0.40. No direct provider path bypasses the adapter.

## Candidate decision

**Keep 1600/high in production.** Public catalog photos and synthetic geometry/safety fixtures do not establish identification accuracy, symptom recognition, abstention, recommendation safety or diagnostic non-inferiority. The user confirmed no reviewed corpus is available. Crop/QR fixtures are clearly marked experimental, never production transformations. Separate smaller inference images would require trusted derivation or cryptographic source binding, another preprocessing identity, platform decoding validation and reviewed quality evidence. These costs are not justified by a Boolean token probe alone.

No new savings are attributed to safety reuse already demonstrated in Step 2. Client encoding reuse has no expected OpenAI token saving because provider bytes are identical. Smaller images may preserve the same tile count. Actual experiments and projections are in [the benchmark](ai-vision-token-benchmark.md).

## Dependency and compatibility map

| Component | Depends on / invariant |
|---|---|
| Selection hook | cancellation sequence, previous-image ownership, context clearing, preview disposal |
| Encoding cache | immutable module-validated Blob; bounded, session-only; never authorization |
| Safety classifier/receipt | exact image SHA-256, actor, current prompt/schema/model/decision policy; fail closed |
| Upload handler | current household role, JPEG parser, intent/path binding, private bucket policy; no direct client Storage writes |
| Care/diagnosis | existing model, prompts, schema, output caps, household/plan checks and retry identity |
| Shared adapter | new migration before new Edge deployment; existing reservation/start/settle/circuit breaker |
| Benchmark | JWT + approved expiring run + registered exact bytes + separate namespace + shared financial gate |
| Old clients | unchanged request/response contracts; missing/old receipts fall back to authorized database-backed validation |

Physical iOS/Android camera/gallery, store binaries and real low-memory devices require device acceptance. Browser/codec tests exercise real decoding and native-boundary mocks, not physical-device certification.

## Measured client boundary

The pre-change reproduction executed one data-URL fetch, one byte FileReader and one data-URL FileReader while saving an already normalized image. The updated real-browser assertion executes zero of each and returns the same Blob and encoded bytes. Ten local 640×480 generated-image samples per engine measured median cached time below timer resolution versus 1ms Chromium and 46ms WebKit for the current uncached fallback. A displayed 0ms is timer quantization, not zero computation. These numbers compare two current paths on this machine; they are not a whole-device latency or memory benchmark. Encoding/read counts and byte identity are the reliable conclusions.

Physical memory pressure, device backgrounding and slow-device behavior remain NOT EXECUTED. Bounded provider streams, cancellation, native picker recovery, ten sequential selections including HEIC, orientation, metadata removal, old-browser feature fallbacks and rapid/context replacement pass deterministic/browser checks.
