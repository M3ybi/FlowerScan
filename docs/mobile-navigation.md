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

On screens up to 780 CSS pixels wide, the plant detail back link is fixed in the
upper-left safe area. Its `#/` destination deliberately returns to the plant overview
for direct links, refreshes and in-app visits, without relying on browser history.
Search and pagination remain in `App`, so returning from details preserves them.
Desktop back-link positioning and desktop tab navigation retain their existing layout.

Shared CSS variables define the bottom bar height, safe-area offset and content
clearance. The authenticated shell reserves that space, and sticky pagination sits
above it. Controls use the existing sticky/navigation/modal stacking tokens. The
detail header reserves space for the floating back button; no scroll listener is used.
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

## Verification

```bash
npm run test:mobile-navigation          # Offline unit and rendered-component checks
npm run test:mobile-navigation-browser  # Composed App workflows in Chromium
npm run test:mobile-navigation-webkit   # Same workflows in WebKit
npm run check                          # Type checking, all offline suites and build
```

Browser checks use synthetic local data and mocked provider boundaries. They cover
320, 360, 375, 390, 430, 768, 1024 and 1440 pixel widths; scrolling, route transitions,
modal focus/stacking, additions/deletions, pagination operations, rapid input, search,
localization, simulated safe-area insets, shortened viewports and horizontal overflow.
They do not replace physical iOS/Android keyboard, browser chrome or camera testing.

Deployment uses the existing site and configured workflow after validation. This
frontend change requires no backend rollout or migration; rollback uses the previous
verified web deploy.

## Changed files

| Files | Purpose |
| --- | --- |
| `src/App.tsx`, `src/components/AppShell.tsx` | Compose persistent navigation and the shared Add Plant modal; keep focused fields clear of navigation. |
| `src/components/AppNavigation.tsx` | Localized navigation label and accessible active-page state. |
| `src/features/plants/components/PlantDetailsPage.tsx` | Floating back-link styling hook and deterministic overview destination. |
| `src/features/plants/hooks/usePlantActions.ts` | Open Add Plant without a route change. |
| `src/components/PlantPagination.tsx`, `src/hooks/usePagination.ts` | Shared Lucide controls and bounded, preserved pagination state. |
| `src/features/dashboard/components/DashboardPage.tsx`, `src/features/diagnosis/components/DiagnosisPage.tsx` | Use shared pagination; remove page-owned mobile navigation and dashboard-owned modal. |
| `src/features/qr/components/QrPage.tsx`, `src/features/settings/components/SettingsPage.tsx` | Remove page-owned mobile navigation. |
| `src/styles.css`, `src/lib/i18n.ts` | Responsive navigation, safe-area spacing, floating back control, pagination states and translations. |
| `tests/mobile-navigation.test.tsx`, `scripts/test-mobile-navigation-browser.mjs`, `tests/fixtures/application-browser.tsx` | Unit/rendered-component coverage and composed browser workflows with configurable synthetic collections. |
| `tests/mobile-ux-cleanup.test.ts`, `tests/menu-ux.test.ts`, `tests/audit-reliability.test.ts` | Update existing tests for shared component ownership and the removed route dependency. |
| `tests/subscription-state.test.ts` | Fix pre-existing calendar-sensitive fixtures through the controller's existing clock dependency. |
| `package.json`, `scripts/run-tests.mjs`, `.github/workflows/verify.yml` | Register offline coverage and both browser engines in CI. |
| `README.md`, `docs/mobile-navigation.md` | Document architecture, checks and verification limits. |
