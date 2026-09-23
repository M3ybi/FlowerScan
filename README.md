# Plantie

Plantie is a mobile-ready React app for household plant care: plant profiles, QR labels, watering records, diagnosis, care generation, subscriptions, and household sharing.

## Local Development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` for local browser variables. Keep real server secrets in Netlify environment variables or Supabase Edge Function secrets, never in committed files and never under a `VITE_` prefix.

## Validation

```bash
npm run typecheck
npm test
npm run build
```

For a single production-review command:

```bash
npm run check
```

The test runner executes all checked-in `test:*` suites sequentially to avoid shared `.tmp-tests` output races on Windows.

## Backend And Hosting

Supabase is the default backend provider for app data and authenticated Edge Functions. Netlify remains the web host and legacy compatibility function host.

Frontend environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_BACKEND_PROVIDER=supabase` optional, because Supabase is the default

Important server-only variables:

- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `REVENUECAT_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `NETLIFY_BLOBS_TOKEN`
- `VAPID_PRIVATE_KEY`

Do not expose server-only keys in frontend code or any `VITE_*` variable.

See:

- `docs/supabase-setup.md`
- `docs/supabase-storage-buckets.md`
- `docs/supabase-first-backend.md`
- `docs/revenuecat-billing.md`

## Netlify

`netlify.toml` is the deployment source of truth:

- build command: `npm run build`
- publish directory: `dist`
- functions directory: `netlify/functions`

## Mobile Wrapper

Capacitor is configured for iOS and Android shells.

```bash
npm run mobile:build
npm run mobile:ios
npm run mobile:android
```

See `docs/mobile-capacitor.md`.

## Data Safety

Use forward-only Supabase migrations. Do not run destructive database resets, drops, truncates, bulk deletes, storage wipes, or project recreation against production infrastructure. Document destructive cleanup ideas for manual review instead.
