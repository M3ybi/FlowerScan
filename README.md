# Plantie

Plantie is the application in the FlowerScan repository: household plant care, private photos, AI identification and diagnosis, QR labels, invitations and server-confirmed subscriptions. The hosted domain is `plantiecare.com`; navigation uses hash routes, with dedicated authentication callback/recovery paths.

## Architecture and repository

| Path | Responsibility |
| --- | --- |
| `src/main.tsx`, `src/App.tsx` | React entry point, session/household coordination and application composition |
| `src/features/`, `src/hooks/`, `src/app/` | Feature actions, shared lifecycle hooks, routing and presentation |
| `src/lib/`, `src/utils/` | Supabase repositories, billing, image processing and domain rules |
| `supabase/functions/` | Nine Edge entry points and shared authorization, image, email and observability controls |
| `supabase/migrations/`, `supabase/tests/` | Required forward-only database history and SQL regression fixtures |
| `netlify/functions/`, `netlify.toml` | Web hosting, gated legacy compatibility and independently authenticated webhook/deletion routes |
| `android/`, `ios/` | Capacitor native shells; platform-generated build outputs are ignored |
| `FlowersImg/`, `public/`, `mobile-assets/` | Referenced catalog assets, service worker, icons and required notices |
| `tests/`, `scripts/` | Deterministic tests, controlled browser workflows, local integration and release tooling |
| `docs/` | Operational guides, recovery instructions and historical implementation evidence |

The frontend uses React 18, TypeScript and Vite 6. Supabase is the default backend for Auth, household data/RPCs, private Storage and Edge Functions. RevenueCat events settle subscriptions on the server; Resend handles account/invitation mail. Capacitor wraps the same web application for Android/iOS. Compatibility code remains where existing deployed clients, scheduled jobs, webhooks or operator recovery may still depend on it.

## Local setup

Use a maintained Node.js release supported by the toolchain (Node 24 LTS is the current local default), npm, and a security-patched JDK 21 for Android. Android also requires the Android SDK; iOS compilation requires macOS/Xcode. Keep `JAVA_HOME` configured persistently; see [Android setup](docs/android-internal-testing.md).

```bash
npm ci
npm run dev
```

Copy `.env.example` to `.env.local` and supply local public configuration. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` select the frontend project. `VITE_BACKEND_PROVIDER` defaults to `supabase`. Billing mode and its matching public SDK key must be explicit; see [billing configuration](docs/revenuecat-billing.md).

Server credentials belong in provider secret stores, never in frontend variables or committed files. Important server references include `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `REVENUECAT_WEBHOOK_SECRET` and the optional image-validation signing secret. Use `.env.example` as the configuration inventory. Never put a server secret under `VITE_`.

## Development and verification

```bash
npm run check                 # TypeScript unused checks, offline tests and production build
npm run check:source-graph    # Resolved first-party imports, workers and cycles
npm run check:client-secrets  # Scan built text artifacts without printing credentials
npm audit
```

Tests run sequentially because several suites share `.tmp-tests` and clear generated fixtures. `npm test` covers the explicitly listed offline suites; it does not run every `test:*` command. No separate ESLint/formatter configuration is imposed; strict TypeScript checks include unused locals and parameters.

Controlled browser workflows include `test:application-browser`, `test:application-webkit`, `test:image-browser`, `test:image-webkit`, `test:auth-flow-browser`, and `test:qr-header-browser`. Install the pinned Playwright browsers when needed. They test synthetic accounts/providers and do not prove a live purchase, delivered email or physical camera operation.

`test:postgres` and `test:postgres-migrations` require an explicitly configured disposable loopback PostgreSQL administrator URL in `PLANTIE_TEST_POSTGRES_URL`. `test:supabase-local` requires Docker and creates a disposable local project. Edge type/signature tests require the Deno version pinned in CI. Missing infrastructure is a blocked gate, not a pass. `test:database-audit`, image-storage checks and catalog seeding contact a linked/selected backend and must not be run as routine local validation.

## Critical workflows and safety contracts

- Authentication uses Supabase PKCE, persisted sessions and checked web/native callback routes. Account sign-out and recovery are handled by the active application account flow.
- Plant and household mutations use server authorization and operation scopes that discard stale account/household results. Invitations require the recipient's verified account; owners can retry delivery using encrypted Vault-backed tokens.
- Original camera/gallery files are limited to **15 MiB**. The client normalizes them into JPEGs up to **2 MiB** and a 1600-pixel longest side. The server independently checks decoded byte bounds and normalized-image structure before authorized private storage writes. HEIC decoding remains lazy and worker-isolated.
- Premium, Free usage and household permissions come from server state. A client SDK result cannot grant Premium. Preserve the product rules and provider lifecycle ordering.
- Legacy token routes require a separate server opt-in. The RevenueCat webhook and deletion-review endpoint have their own authorization; a frontend flag does not disable or authorize those handlers.

## Build, mobile and deployment

```bash
npm run build
npm run android:build
npm run mobile:build
```

Netlify publishes `dist` using `netlify.toml`. GitHub Pages has a separate verified workflow with the `/FlowerScan/` base path. Capacitor synchronization packages the reviewed web bundle into each native shell. Generating a graph with `node scripts/analyze-source-graph.mjs --write` writes only the ignored `.tmp-tests/source-graph.json` report.

A local build does not deploy anything. Review [release operations](docs/v4-deployment-runbook.md), [billing](docs/revenuecat-billing.md), [authentication](docs/authentication-flows.md), [image handling](docs/image-upload-pipeline.md) and [mobile setup](docs/mobile-capacitor.md) for provider-specific requirements. Historical audit/deployment reports describe their recorded revision and date, not necessarily current hosted state.

Preserve all required migrations and recovery evidence. Never reset a linked database, delete production records/storage/functions, run privileged seeding, or change production configuration as part of repository hygiene. `.netlify` may contain private recovery artifacts and is intentionally excluded from source control. See the [October 30 cleanup report](docs/cleanup-2026-10-30.md) for measured changes and verification limits.
