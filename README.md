# Plantie

Mobilná webová aplikácia na evidenciu izbových rastlín, QR štítky, zálievku, presádzanie a poznámky.

## Lokálny vývoj

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Supabase foundation

The Supabase database foundation is prepared but not yet connected to the current app storage flow.

Required frontend environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Do not expose a Supabase service role key in frontend code or any `VITE_*` variable.

See `docs/supabase-setup.md` and `docs/supabase-storage-buckets.md`.

Catalog seed validation:

```bash
npm run test:supabase
```

Catalog seed, local/server only:

```bash
npm run seed:plant-catalog
```

Billing validation:

```bash
npm run test:billing
```

RevenueCat billing is prepared but disabled. See `docs/revenuecat-billing.md`.

Legacy-to-Supabase import is available as an opt-in account action. It keeps legacy storage primary.
See `docs/legacy-supabase-migration.md`.

## Mobile app wrapper

Capacitor is configured for iOS and Android shells.

```bash
npm run mobile:build
npm run mobile:ios
npm run mobile:android
```

See `docs/mobile-capacitor.md`.

## Publikovanie

Aplikácia je pripravená na GitHub Pages cez workflow `.github/workflows/deploy.yml`.

## Denný email report

Automatický email report potrebuje hosting so serverless funkciami. Projekt je pripravený pre Netlify:

- build command: `npm run build`
- publish directory: `dist`
- functions directory: `netlify/functions`

Potrebné environment variables v Netlify:

- `RESEND_API_KEY` - API kľúč pre odosielanie emailov cez Resend
- `REPORT_FROM_EMAIL` - overený odosielateľ, napr. `Plantie <report@tvoja-domena.sk>`
- `OPENAI_API_KEY` - API kľúč na AI generovanie starostlivosti pri pridávaní novej rastliny
- `OPENAI_MODEL` - voliteľné, predvolená hodnota je `gpt-4o-mini`

Report sa kontroluje každú hodinu a odošle sa iba raz denne, keď je v časovej zóne `Europe/Bratislava` 19:00. Do emailu idú iba rastliny so stavom zálievky pod 20 %.

AI generovanie sa používa iba pri vložení novej rastliny. Existujúci katalóg rastlín sa tým nemení.
