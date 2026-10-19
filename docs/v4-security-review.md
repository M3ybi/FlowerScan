# V4 final code candidate security review

Result: **zero reportable remaining findings within the reviewed immutable diff**. This does not certify hosted configuration, third-party services, a whole-repository absence of vulnerabilities or the original physical-image incident.

The primary generated [canonical security report](<C:/Users/fedor/.codex/state/plugins/codex-security/scans/Flowscan/93992572890033edc00185151fdec308268f38d2_20261019T072924Z_cz14jzle/report.md>) is retained outside the repository. Scan ID: `a9413629-185f-48b1-acfa-5f6b81499b84`. It was finalized once and its sealed result was read back. Canonical manifest, coverage, findings, threat model and SARIF remain alongside that report. This document summarizes them for repository review; it does not replace or edit the sealed artifacts.

## Scope and independent method

Exact range: `4077c2c5c6c3a89fda71328c350157e2374cfe10..93992572890033edc00185151fdec308268f38d2`. All **29** compact source inventory entries and **13** additional changed test/config files were read. An independent architecture reviewer produced the retained source-backed repository model; separate reviewers checked database and Edge/client changes, and the parent checked release/hosting/test execution paths. Minimum supporting V3 source was followed where a changed control depended on it. No applicable SECURITY.md was found. Preflight passed without changing user settings.

The candidate includes four local V4 commits; subsequent V4 reports and the storage-guide correction are documentation-only and outside this immutable code range. The preceding V4 scan `06ab10ab-0826-4b9e-97b3-802736bb3e1e` remains sealed at `c3af7c7`. Final emitted-file verification then found incorrect manifest hashes, because a normal Vite hook could still rewrite entry code. `9399257` moves hashing to a post-order hook and adds an actual-build regression that failed before and passes after. The final scan retains prior review only for Git blobs verified unchanged, and independently rereads all three changed delta files (Vite config, package test registration, new artifact test). Its canonical repository architecture model is preserved from the prior scan with that known scope. This does not reuse or alter the earlier V3 baseline scan. Static reviewers did not execute application code or contact services; the separate local verification is reported in [the release summary](v4-release-summary.md).

## Control dispositions

| Surface | Source-backed review result |
| --- | --- |
| Upload reservation | Post-lock membership check precedes intent mutation; derived UUID paths, cap 20, existing signatures/grants and private Storage controls retained. Already-fixed race is not counted as a remaining finding |
| Historical coowner transition | Only complete absence skips the targeted grant. Existing strict owner/member lookup and partial/ambiguous failure remain; no new general coowner authority |
| Nine Edge endpoints | User JWT, Auth signature/timestamp, RevenueCat shared secret and operator allowlist remain distinct. Wrapper does not replace authorization, receipt validation, quotas or provider deadlines |
| Receipts and old clients | User/exact-byte binding retained; absent optional receipt follows server safety validation; invalid receipt fails closed; no blind ambiguous-network resend |
| Invitation client | Known bounded public codes/provider IDs only; 30-second budget covers invocation/error-body read; one explicit invocation, authoritative server recipient/token remains unchanged |
| Logs and public errors | Operation UUID is generated server-side; fixed operation/status/duration/outcome only. No body, URL, header, image, credential or exception text enters the new event; uncaught errors become generic 503 |
| Build and hosting | Server dotenv values are not injected into the client by loading build config; manifest exports hashes/metadata only; the final post-order hook is checked against actual emitted entry bytes. Hashes establish consistency, not signed whole-artifact provenance. Non-local targets/key classes are checked, local mode remains operator-controlled. Netlify's broad script/connect CSP is explicitly report-only; Pages does not gain equivalent headers from this config |
| Disposable test authority | Trusted local administrator/Docker/CDP/ADB configuration is a prerequisite. Generated DB/project names, explicit local operations and cleanup tracking are preserved. No test endpoints are imported into the application build |
| Existing provider/deletion protections | Signed sandbox events remain denied by default in both webhook paths; service-only ordered receipt application and JWT-bound private deletion review remain intact |

No plausible new candidate remained after discovery, so candidate validation/attack-path phases were not fabricated. Coverage is complete **for the changed-file static review**; hosted/API/provider/physical questions are retained as open questions, not silently marked passed.

## Executed security-related evidence and residual gates

Both npm audits reported zero vulnerabilities at execution time. The emitted client scan checked 26 text artifacts without printing values. Nine Deno entrypoints, actual Auth signature adapter, handler abuse/error paths, SQL RLS/grants/order/concurrency and release failure-exit tests pass. These are bounded tests, not proof of all deployed behavior.

Unresolved: actual gateway JWT configuration (especially shared-secret RevenueCat delivery), secret presence/routing, signed-hook activation, sender DNS/delivery, provider restore/receipt behavior, full Supabase/Vault/JWT/Storage HTTP acceptance, physical image lifecycle and signed store builds. Old native clients and partial deployments require hosted rehearsal. Existing signed events without environment markers retain compatibility; no retrospective entitlement revocation was performed. Broadening production sandbox access is not an approved mitigation.

Architecture review identified a stale `docs/supabase-storage-buckets.md` description of 8 MB/member direct writes. The follow-up documentation now reflects effective 2 MiB new JPEG objects and validated service-mediated insert/update. The original mismatch remains recorded in the immutable candidate model rather than rewriting history.

Host-reported final scan usage: **2,484,406 total tokens**, including **2,471,040 cached input tokens**; 2,479,255 input and 5,151 output. This is the tool's conversation/rollout accounting, including cached history, not an independently measured incremental cost of this narrow review. The host reported usage coverage complete and threadCount 1; that accounting field is not a count of all independent reviewers. The earlier scan retains its own separate usage record; these counters are not added as independent costs.

Daybreak advisory reported `not_granted`; this did not block review or authorize any access. Protected outputs may require [Daybreak enrollment](https://chatgpt.com/cyber). No configuration change was made for that advisory.
