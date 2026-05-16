# FlowerScan

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

## Publikovanie

Aplikácia je pripravená na GitHub Pages cez workflow `.github/workflows/deploy.yml`.

## Denný email report

Automatický email report potrebuje hosting so serverless funkciami. Projekt je pripravený pre Netlify:

- build command: `npm run build`
- publish directory: `dist`
- functions directory: `netlify/functions`

Potrebné environment variables v Netlify:

- `RESEND_API_KEY` - API kľúč pre odosielanie emailov cez Resend
- `REPORT_FROM_EMAIL` - overený odosielateľ, napr. `FlowerScan <report@tvoja-domena.sk>`

Report sa kontroluje každú hodinu a odošle sa iba raz denne, keď je v časovej zóne `Europe/Bratislava` 19:00. Do emailu idú iba rastliny so stavom zálievky pod 20 %.
