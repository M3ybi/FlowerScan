# Mobile navigation and plant pagination

Authenticated application pages share `AppShell`, including plant details, diagnosis,
QR, menu subsections, invitations and legal/support pages. It owns the single
`MobileBottomNav` and the existing `AddPlantModal`. Authentication, recovery and
household onboarding retain their dedicated layouts. Camera capture continues to
use the existing image picker/native camera flow.

The shell stays mounted across ordinary hash-route changes and lazy feature loads.
The Add Plant action opens its modal over the current page without redirecting;
existing image validation, submission guards and household authorization still apply.
The existing dialog handles focus trapping, Escape, focus restoration, scroll locking
and visual viewport resizing.

On screens up to 780 CSS pixels wide, `BackLink` keeps page-level back navigation
fixed in the upper-left safe area. Each caller supplies its existing parent `href`;
the component does not inspect browser history. Direct links and refreshes therefore
return to the same destination as in-app visits. Search and pagination remain in
`App`, so returning from details preserves them. Desktop links remain in their
existing header positions and desktop tab navigation retains its layout.

| Page or route | Back destination |
| --- | --- |
| Plant detail, diagnostics panel and missing-plant fallback | `#/` |
| Diagnosis, QR, authenticated menu and its subsections | `#/` |
| Invitation review (`#/join`) | `#/menu` |
| Privacy, terms, support, account deletion, subscription terms | `#/` |
| Release readiness and health | `#/` |

The dashboard and authentication/onboarding screens do not gain a new back button.
The invitation overlay's return-to-inbox button, authentication tab arrows and
onboarding step controls remain local interactions inside their existing flows.

Shared CSS variables define the bottom bar height, safe-area offset and content
clearance. The authenticated shell reserves that space, and sticky pagination sits
above it. Controls use the existing sticky/navigation/modal stacking tokens. The
page shell reserves space whenever it contains `BackLink`; no route-specific header
offsets or scroll listeners are used for floating navigation.
Form fields have scroll margins. While an editable field outside a modal is focused,
the shell checks that it clears fixed navigation, including on viewport resizing,
and scrolls it into view if needed. These resize subscriptions are removed on blur;
no scroll listener is attached. Modal forms retain their existing visual viewport
handling. No database, API, permissions or dependency changes are required.

`PlantPagination` is shared by the dashboard and diagnosis picker. Lucide SVG buttons
have native disabled semantics, localized labels and a polite page-status indicator.
`usePagination` preserves valid pages on search/collection changes and clamps an
invalid page immediately, then commits the correction. Empty and single-page
collections do not render pagination. The existing ten-item page size is unchanged.

## Visual proportions

Navigation controls share a theme-aware surface, thin border, restrained shadow,
green active surface and 1.8-pixel icon stroke. The floating back target is 46 pixels.
The bottom bar uses equal columns, 22-pixel icons, 11–12-pixel labels and a 66-pixel
container, capped at 540 pixels on tablets. Text labels have their own row; Add Plant
may use two balanced lines. Compact localized labels keep longer translations
readable without changing desktop labels, destinations or full accessible action
names. Print layouts exclude floating navigation and its reserved top space.

Pagination retains all four 44-pixel targets and its existing state logic. Flat icon
buttons surround an inner capsule: current page is emphasized, separator and total
are secondary. The localized template supplies the order and wording. There is one
polite status region. Disabled icons remain visible, and the existing reduced-motion
rule covers color transitions. Earlier competing navigation/pagination decoration
rules are removed rather than layered underneath component overrides.

## Verification

```bash
npm run test:mobile-navigation          # Offline unit and rendered-component checks
npm run test:mobile-navigation-browser  # Composed App workflows in Chromium
npm run test:mobile-navigation-webkit   # Same workflows in WebKit
npm run check                          # Type checking, all offline suites and build
```

Browser checks use synthetic local data and mocked provider boundaries. They cover
320, 360, 375, 390, 414, 430, 768, 1024 and 1440 pixel widths; scrolling, route transitions,
modal focus/stacking, additions/deletions, pagination operations, rapid input, search,
localization, simulated safe-area insets, shortened viewports and horizontal overflow.
They do not replace physical iOS/Android keyboard, browser chrome or camera testing.

Deployment uses the existing site and configured workflow after validation. This
frontend change requires no backend rollout or migration; rollback uses the previous
verified web deploy.

## Changed files

| Files | Purpose |
| --- | --- |
| `src/components/BackLink.tsx` | Reusable page-level back link with explicit parent destinations. |
| `src/App.tsx` | Use the shared back link on invitation and release/legal pages; remove history guessing and obsolete props. |
| `src/features/plants/components/PlantDetailsPage.tsx` | Share the back control on detail and missing-plant screens. |
| `src/features/diagnosis/components/DiagnosisPage.tsx`, `src/features/qr/components/QrPage.tsx`, `src/features/settings/components/SettingsPage.tsx` | Replace page-specific back anchors with the shared component. |
| `src/components/AppNavigation.tsx` | Larger mobile icons and explicit label rows, preserving all five actions. |
| `src/components/PlantPagination.tsx` | Emphasized current-page capsule using the existing localized template and pagination handlers. |
| `src/styles.css`, `src/lib/i18n.ts` | Consolidated component styling, shared navigation tokens and compact localized diagnosis labels. |
| `tests/mobile-navigation.test.tsx`, `tests/mobile-ux-cleanup.test.ts`, `scripts/test-mobile-navigation-browser.mjs` | Shared-back coverage, updated component assertions, responsive visual/geometry checks and existing behavioral regressions. |
| `docs/mobile-navigation.md` | Navigation coverage, proportions, architecture and verification limits. |
