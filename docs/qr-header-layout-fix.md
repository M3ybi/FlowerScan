# QR labels header

The QR header previously placed two fixed-width `.icon-button` controls beside
`.hero-actions` in the shared `.topbar-actions` flex row. The default cross-axis
stretch made the icon buttons as tall as the wrapped household controls. The
actual application reproduction measured 44 × 114 px buttons on desktop, with
no visible action labels.

`QrPage` now separates its title/back link, localized subtitle, QR actions, and
existing household/notification controls into named grid areas. The QR-specific
`.qr-header*` selectors leave other page headers alone:

- At 1024 px and wider, actions sit beside the title, with the household controls
  beside the subtitle.
- At 768–1023 px, actions have a separate row and may wrap naturally.
- Below 768 px, title, subtitle, actions, and household controls have their own
  rows. Both actions stay visible and wrap when their translated text needs it.

The header actions reuse `LoadingButton`, `primary-action`, `ghost-action`, and
the existing spacing, brand, and radius tokens. Content determines their width;
44 px minimum touch targets, centered icon/text columns, and cross-axis alignment
prevent vertical stretching. The spinner occupies the download icon's column.
The darker brand color keeps the small download label above AA contrast. Focus,
active, disabled, and busy states remain visible. Empty households disable both
header actions, and PDF status is announced through a live status region.

`qr.exportPdf`, `qr.printCodes`, and the new `qr.body` copy cover English, Slovak,
German, French, and Spanish. The visible English actions are **Download PDF** and
**Print**; Slovak uses **Stiahnuť PDF** and **Tlačiť**.

The two existing PDF export entry points share a synchronous request lock in
`App`. A React state flag alone allowed both handlers to start before the next
render. The lock is released after success/error and reset with household
operations; an older request cannot clear a newer request's lock. PDF contents,
QR encoding, public URLs, plant identifiers, household selection, subscription
checks, and `window.print()` are unchanged.

Run `npm run test:qr-header-browser` and `npm run test:qr-header-webkit`. Each
uses the actual `App` and QR page with local Auth/RPC boundaries and blocked
external requests. Coverage includes all five languages at 320, 375, 390, 430,
768, 1024, and 1440 px, control bounds and alignment, household/notification
dialogs, keyboard focus and activation, raster-measured text contrast, real A4
PDF downloads, print media, simultaneous/repeated export clicks, empty
households, and rendering failure followed by a successful retry. Results,
screenshots, and generated PDFs are saved under
`.tmp-tests/qr-header-{chromium,webkit}/`. Both suites also run in the existing
verification workflow. The full application browser suites and `npm run check`
remain the broader regression gates.

Local validation passed: 621 Node test executions, type checking and build,
40 QR scenarios per browser engine, 11 application workflow checks per engine,
the client artifact credential scan, and `git diff --check`. The minimum sampled
header-action text contrast was 7.88:1 in both engines. No database or provider
configuration changes are part of this patch.
