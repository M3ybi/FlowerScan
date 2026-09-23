# Codebase Audit Notes

Last updated: 2026-09-23

## Current Shape

- Frontend: Vite, React, TypeScript, Capacitor.
- Hosting: Netlify build and functions from `netlify.toml`.
- Primary backend: Supabase browser client and Supabase Edge Functions.
- Legacy compatibility backend: Netlify Functions, gated by explicit legacy flags.
- Data model: forward-only Supabase migrations under `supabase/migrations`.

## Preserved Infrastructure

- No Supabase project, Netlify site, bucket, or production data changes were made.
- No destructive SQL was added or run.
- Existing Netlify function directory and Supabase Edge Function layout remain unchanged.
- Server-only secrets remain outside frontend `VITE_*` variables.

## Completed Safe Refactors

- Extracted route parsing and public route gating from `App.tsx` into `src/app/routes.ts`.
- Extracted invite URL/token/error helpers into `src/app/householdInvites.ts`.
- Extracted date, URL, title, and watering display helpers into `src/app/appFormatting.ts`.
- Extracted care preview/diff presentation helpers into `src/app/carePresentation.tsx`.
- Extracted local diagnostic display helpers into `src/app/localDiagnostics.ts`.
- Extracted record merge/equality helpers into `src/app/records.ts`.
- Extracted primary and mobile navigation into `src/components/AppNavigation.tsx`.
- Added a dashboard overview component that summarizes due care, upcoming care, diagnosis history, and the next focus plant without adding data-layer access to UI code.
- Added a lightweight botanical SVG mark for the product redesign direction.
- Added a 2026 product redesign CSS layer with calmer tokens, tighter radius rules, improved desktop/mobile layout behavior, and reduced motion handling.
- Added a repo-level test orchestrator, `npm test`, and `npm run check`.
- Added `.env.example` with placeholders and server-only secret boundaries.

## Drop Candidates

- Keep legacy Netlify household/data functions only while rollback compatibility is required. When Supabase-only production has aged successfully, remove legacy data-write paths in a dedicated migration PR.
- Remove duplicated RevenueCat webhook validation once the active runtime is confirmed. Netlify and Supabase handlers currently coexist for rollout safety.
- Remove localStorage migration compatibility only after analytics show no active legacy households need import or recovery.

## Refactor Candidates

- Split `src/App.tsx` further by route: dashboard, detail, menu, diagnose, QR, onboarding, and household setup.
- Move the dashboard route into a dedicated component now that the overview, navigation, route parsing, and display helpers are separated.
- Convert detail, menu, QR, diagnose, and onboarding surfaces to the same presentational-component pattern used by the dashboard overview.
- Move Supabase startup/household session orchestration into a dedicated hook.
- Move plant mutation handlers into a hook that owns legacy/Supabase write policy.
- Move diagnosis save/update flows into a focused hook with explicit local and Supabase branches.
- Break `src/lib/plantieRepository.ts` into catalog, household, plants, diagnostics, reports, and billing repository modules.
- Split `src/lib/i18n.ts` by language or namespace to reduce review noise and merge conflicts.

## Enhance Candidates

- Add integration tests around Supabase startup state transitions using mocked repository calls.
- Add function-level tests for Supabase Edge Function auth/error handling where local Deno tooling is available.
- Add Playwright smoke coverage for the primary mobile flows: create household, add plant, scan QR, diagnose, invite member.
- Add CI that runs `npm run check` on every pull request.
- Add bundle budgets after the app route split, then lazy-load heavyweight route surfaces if needed.
