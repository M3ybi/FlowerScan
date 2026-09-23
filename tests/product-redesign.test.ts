import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync("src/App.tsx", "utf8");
const loadingButtonSource = readFileSync("src/components/LoadingButton.tsx", "utf8");
const styleSource = readFileSync("src/styles.css", "utf8");

test("dashboard overview UI is removed from the dashboard surface", () => {
  assert.doesNotMatch(appSource, /DashboardOverview/);
  assert.doesNotMatch(appSource, /diagnostics=\{diagnostics\}/);
  assert.doesNotMatch(appSource, /onAddPlant=\{openAddPlantModal\}/);
  assert.doesNotMatch(styleSource, /dashboard-overview|dashboard-insight|dashboard-focus|dashboard-botanical|dashboard-overview-actions/);
  assert.doesNotMatch(appSource, /careSummaryKey/);
});

test("redesign layer defines coherent product surfaces and responsive behavior", () => {
  assert.match(styleSource, /2026 product redesign layer/);
  assert.doesNotMatch(styleSource, /\.detail-shell\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*0\.95fr\)/);
  assert.doesNotMatch(styleSource, /grid-row:\s*4\s*\/\s*span\s*3/);
  assert.match(styleSource, /\.detail-shell,\s*\n\.qr-shell,\s*\n\.report-shell\s*\{[\s\S]*max-width:\s*1040px;/);
  assert.match(styleSource, /@media \(prefers-reduced-motion: reduce\)/);
});

test("async actions share accessible loading button and logic-level duplicate guards", () => {
  assert.match(loadingButtonSource, /export const LoadingButton/);
  assert.match(loadingButtonSource, /aria-busy=\{isLoading \|\| undefined\}/);
  assert.match(loadingButtonSource, /disabled=\{disabled \|\| isLoading\}/);
  assert.match(styleSource, /\.button-spinner\s*\{/);
  assert.match(styleSource, /button\[aria-busy="true"\] \.button-spinner/);
  assert.match(styleSource, /\.button-label\s*\{[\s\S]*color:\s*inherit;/);
  assert.match(styleSource, /\.primary-action svg,[\s\S]*\.button-spinner\s*\{[\s\S]*color:\s*currentColor;/);
  assert.match(appSource, /import \{ LoadingButton \}/);
  assert.match(appSource, /if \(isCreatingInvite\) \{/);
  assert.match(appSource, /if \(isJoiningInvite\) \{/);
  assert.match(appSource, /if \(isSigningOut\) \{/);
  assert.match(appSource, /if \(isAddingPlant\) \{/);
  assert.match(appSource, /if \(isCapturingNewPlantImage \|\| isAddingPlant\) \{/);
  assert.match(appSource, /finally \{\s*setIsCreatingInvite\(false\);/);
  assert.match(appSource, /finally \{\s*setIsJoiningInvite\(false\);/);
  assert.match(appSource, /finally \{\s*setPendingQuickRecordKey\(""\);/);
});

test("scan action button text is centered and not recolored by panel copy selectors", () => {
  assert.doesNotMatch(styleSource, /\.scan-action-panel span\s*\{/);
  assert.match(styleSource, /\.scan-action-panel > div:first-child > span\s*\{/);
  assert.match(styleSource, /\.scan-action-buttons \.primary-action,\s*\n\.scan-action-buttons \.ghost-action\s*\{[\s\S]*align-items:\s*center;[\s\S]*justify-content:\s*center;/);
  assert.match(styleSource, /\.scan-action-buttons \.button-label\s*\{[\s\S]*color:\s*inherit;/);
});
