# Safety reuse, policy freshness and security

The deployed Step 2 database already reuses successful safety validation at upload. Four uploads were measured at zero additional provider attempts in Step 2. Step 3 preserves this behavior; it does not claim those avoided calls as a newly discovered saving.

## Evidence identity

The server hashes actual JPEG bytes. The authoritative request fingerprint includes the configured model, provider input (including detail), prompt/schema and prompt version; the image URL is replaced with its SHA-256. Safety lookup binds the authenticated actor, fingerprint, completed state, non-null result and unexpired 5-minute window. Cross-household reuse of that actor's same safety result is permitted only after current upload household authorization. Different users cannot reuse the result. Plant image bindings independently enforce household/path/hash ownership.

Cached output now passes the current full structural validator and fail-closed decision predicate again. A stale low-confidence/unsafe/malformed cached result cannot become an upload approval. A material prompt/schema/preprocessing change must use a new version; input changes also change the fingerprint. Tightened decision thresholds are enforced on replay. The immutable-before/after tests simulate an older cached decision and verify rejection without extra inference.

Optional HMAC receipts are actor/action/exact-byte/time bound. Version 2 additionally binds configured model, actual prompt/schema, preprocessing, output limit, high detail and decision policy digest. V1, tampered, expired, future-dated, different-user/bytes/key and incompatible-policy evidence is rejected. Existing clients then take the normal validation path. `IMAGE_VALIDATION_SIGNING_SECRET` remains absent in production: no measured paid-inference benefit justifies enabling it over working database reuse.

## Expiry and authorization matrix

| Case | Expected behavior |
|---|---|
| Immediate save, same bytes/actor | reuse, zero additional safety attempts |
| Several minutes but under 5-minute server expiry | reuse if all bindings still eligible |
| At/after server expiry | fresh high-detail validation or safe failure |
| Session refresh with same authenticated user | server reuse remains eligible; no token embedded in identity |
| Same photo selected again | exact normalized bytes can replay; visually similar bytes cannot |
| New image / metadata / incompatible preprocessing | normalized bytes checked; new fingerprint or rejection |
| New policy/model/prompt | incompatible evidence rejected; changed inputs/version invalidate database identity |
| Concurrent validation/upload | one authoritative operation; in-progress response or completed reuse, not two fabricated zero-cost attempts |
| Same actor, another authorized household | safety can reuse; upload authorization still checked |
| Forged/nonmember/suspended household | denied before upload/inference |
| Client `validated`, model or detail fields | cannot authorize or change ordinary high-detail/model policy |

## Evaluation isolation

`vision-token-benchmark` is JWT protected and fails closed with no active approved run. Three service-only RPCs resolve registered profiles, wrap unchanged Step 2 claim, and recheck the aggregate budget immediately before starting. Runs are disabled by default, expire, permit at most five synthetic actors, and have database constraints of at most 50 attempts/$0.40. Service clients cannot mutate these private run/input tables. Registered hashes, dimensions, encoded bytes, model, prompt version and output cap must all match. There is no user-facing feature flag or entitlement change.

Low-detail probes and safety evaluations use distinct prompt namespaces. Neither returns signed validation capability; Boolean probe output says nothing about safety. Ordinary validation/upload cannot replay evaluation safety. Denied evaluation claims roll back reservations. Unknown usage retains full exposure until trusted reconciliation; zero cost is accepted only when actually reported, never inferred from a missing response.

## Safety quality gate

**NOT VERIFIED for a cheaper classifier or diagnostic representation.** Existing public photos cover some tropical/flowering plants and dark backgrounds; catalog names are weak reference labels. No reviewed examples establish mites, thrips, scale, subtle lesions, nutrient/root disorders, sensitive documents, faces or dangerous-care regression thresholds. A public-photo QR overlay is one deliberately restricted mixed-content example, not a representative safety corpus. Existing malformed/oversized/metadata/authorization tests verify deterministic boundaries, not classifier false-acceptance rates. No lower-detail production policy is activated.

Required future activation evidence: reviewed positive/negative botanical and sensitive-content labels; paired old/candidate trials on identical originals/prompts/model/schema; explicit symptom and recommendation thresholds; no newly accepted high-risk case; bounded ledger-backed costs; reversible server flag and monitoring. Until then retain the current high-detail configuration.
