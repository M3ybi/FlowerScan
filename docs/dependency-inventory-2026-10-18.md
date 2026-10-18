# Dependency inventory - 2026-10-18

Source: npm registry metadata from `npm outdated --json`, exact installed lockfile and source usage inspection. Outdated does not by itself mean unsafe. `npm audit` and `npm audit --omit=dev` both report zero vulnerabilities after the targeted changes.

| Package | Installed | Wanted by range | Registry latest | Disposition |
| --- | --- | --- | --- | --- |
| @capacitor/app | 8.1.1 | 8.1.2 | 8.1.2 | Retained; upgrade requires focused compatibility review. |
| @capacitor/browser | 8.0.4 | 8.0.5 | 8.0.5 | Retained; upgrade requires focused compatibility review. |
| @capacitor/camera | 8.2.0 | 8.2.6 | 8.2.6 | Retained; upgrade requires focused compatibility review. |
| @capacitor/cli | 8.4.3 | 8.4.3 | 8.5.3 | Pinned 8.4.3; newer 8.5.3 introduces the xcode/uuid advisory. Native runtimes are independently patched to 8.5.3. |
| @netlify/blobs | 10.7.7 | 10.7.13 | 11.1.4 | Retained; upgrade requires focused compatibility review. |
| @netlify/functions | 5.2.1 | 5.3.0 | 6.0.2 | Retained; upgrade requires focused compatibility review. |
| @revenuecat/purchases-capacitor | 13.1.4 | 13.7.4 | 13.7.4 | Retained; upgrade requires focused compatibility review. |
| @revenuecat/purchases-js | 1.67.1 | 1.71.0 | 1.71.0 | Retained; upgrade requires focused compatibility review. |
| @supabase/supabase-js | 2.106.2 | 2.118.0 | 2.118.0 | Retained; upgrade requires focused compatibility review. |
| @types/react | 18.3.28 | 18.3.31 | 19.3.0 | Retained; upgrade requires focused compatibility review. |
| @types/react-dom | 18.3.7 | 18.3.7 | 19.3.0 | Retained; upgrade requires focused compatibility review. |
| @vitejs/plugin-react | 5.2.0 | 5.2.0 | 6.1.2 | Retained; upgrade requires focused compatibility review. |
| lucide-react | 0.468.0 | 0.468.0 | 1.59.0 | Retained; upgrade requires focused compatibility review. |
| playwright | 1.61.1 | 1.61.1 | 1.64.1 | Retained; upgrade requires focused compatibility review. |
| react | 18.3.1 | 18.3.1 | 19.3.1 | Retained; upgrade requires focused compatibility review. |
| react-dom | 18.3.1 | 18.3.1 | 19.3.1 | Retained; upgrade requires focused compatibility review. |
| supabase | 2.119.0 | 2.121.0 | 2.121.0 | Retained; upgrade requires focused compatibility review. |
| typescript | 5.9.3 | 5.9.3 | 7.0.2 | Retained; upgrade requires focused compatibility review. |
| vite | 6.4.3 | 6.4.4 | 8.3.4 | Retained; upgrade requires focused compatibility review. |

All direct production packages have actual runtime/platform consumers. Camera, native App/Browser, native purchases and Capacitor platform packages support packaged builds; the web purchases SDK is separately used by web billing. Netlify Blobs, web-push and Netlify Functions support explicitly gated compatibility/scheduled paths and remain required for rollback. jsPDF and QRCode are used by label export; libheif-js is loaded in the HEIC worker. No package was removed solely because it lacks a frontend import.

Type packages, TypeScript, Vite/React plugin, Playwright and Capacitor/Supabase CLIs are build/test/operator tools. The added exact dev dependency @electric-sql/pglite 0.5.10 executes the new forward migration against disposable local PostgreSQL without Docker or production credentials; it is not bundled into the app. No dependency was added to the runtime. Existing test tooling still imports esbuild through Vite's locked dependency tree.

Targeted updates: @capacitor/android, @capacitor/ios and @capacitor/core 8.3.4 -> 8.5.3; @capacitor/cli 8.3.4 -> 8.4.3; @fastify/busboy 3.2.0 -> 3.2.2; source-map-js 1.2.1 -> 1.2.2. No automatic force fix or unrelated major upgrade was applied.

Primary maintainer evidence: [Capacitor advisory](https://github.com/ionic-team/capacitor/security/advisories/GHSA-rvm3-566m-v7fv), [busboy advisory](https://github.com/fastify/busboy/security/advisories/GHSA-xjh9-v7x6-24jw), [PGlite PostgreSQL testing API](https://pglite.dev/docs/api).
