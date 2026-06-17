import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync("src/App.tsx", "utf8");
const styleSource = readFileSync("src/styles.css", "utf8");

test("mobile dashboard removes report and reminder configuration clutter", () => {
  assert.doesNotMatch(appSource, /href="#\/report"/);
  assert.doesNotMatch(appSource, /route\.page === "report"/);
  assert.doesNotMatch(appSource, /createMailtoReportUrl|getWateringReportRows|reportThresholdPercent/);
  assert.doesNotMatch(appSource, /Interval z\?lievky|Preferencia pripomienok|getReminderArchitectureNote/);
});

test("plant cards are clickable with watering and open quick actions", () => {
  assert.doesNotMatch(appSource, /<a className="flower-card"/);
  assert.match(appSource, /className="flower-card"[\s\S]*role="link"[\s\S]*onKeyDown=/);
  assert.match(
    appSource,
    /event\.stopPropagation\(\);[\s\S]*updateCareRecord\(flower\.id, \{ lastWatered: todayIsoDate\(\) \}, t\("detail\.savedWatered"\)\)/,
  );
  assert.match(appSource, /className="plant-card-open-action"[\s\S]*href=\{flowerPath\(flower\.id\)\}/);
  assert.match(appSource, /<ArrowRight size=\{17\}/);
  assert.doesNotMatch(appSource, /<QrCodeIcon size=\{16\}/);
});

test("primary navigation owns Add plant and QR dashboard shortcuts", () => {
  assert.match(appSource, /mobile-bottom-nav-action/);
  assert.match(appSource, /onAddPlant=\{openAddPlantFromMobileNav\}/);
  assert.match(appSource, /className=\{currentPage === "add" \? "active app-tab-nav-action" : "app-tab-nav-action"\}/);
  assert.match(appSource, /href="#\/qr"[\s\S]*t\("nav\.qr"\)/);
  assert.doesNotMatch(appSource, /className="menu-quick-actions"/);
  assert.doesNotMatch(appSource, /className="qr-action dashboard-qr-action"/);
  assert.doesNotMatch(appSource, /className="qr-action add-plant-trigger"/);
});

test("dashboard plant list is paginated", () => {
  assert.match(appSource, /const plantPageSize = 10/);
  assert.match(appSource, /visibleFlowers = filteredFlowers\.slice/);
  assert.match(appSource, /\{visibleFlowers\.map\(\(flower\) =>/);
  assert.match(appSource, /className="plant-pagination"/);
  assert.match(appSource, /setPlantPage\(plantPageCount\)/);
  assert.match(styleSource, /\.flower-grid\s*\{[\s\S]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(styleSource, /\.plant-pagination\s*\{/);
  assert.match(styleSource, /bottom: calc\(84px \+ var\(--safe-area-bottom\)\)/);
});

test("diagnose plant picker has search, pagination, and open affordance", () => {
  const diagnoseRouteStart = appSource.lastIndexOf('if (route.page === "diagnose")');
  const diagnoseRoute = appSource.slice(diagnoseRouteStart, appSource.indexOf('if (route.page === "qr")', diagnoseRouteStart));

  assert.match(diagnoseRoute, /className="toolbar diagnose-toolbar"/);
  assert.match(diagnoseRoute, /value=\{query\}/);
  assert.match(diagnoseRoute, /onChange=\{\(event\) => setQuery\(event\.target\.value\)\}/);
  assert.match(diagnoseRoute, /filteredFlowers\.length > 0/);
  assert.match(diagnoseRoute, /visibleFlowers\.map\(\(flower\) =>/);
  assert.match(diagnoseRoute, /filteredFlowers\.length > plantPageSize/);
  assert.match(diagnoseRoute, /setPlantPage\(plantPageCount\)/);
  assert.match(diagnoseRoute, /className="diagnose-picker-open-icon"/);
  assert.match(styleSource, /\.diagnose-picker-open-icon\s*\{/);
});

test("page back controls use browser history with a fallback", () => {
  assert.match(appSource, /const navigateBack = \(fallbackHash = "#\/"\)/);
  assert.match(appSource, /window\.history\.back\(\)/);
  assert.match(appSource, /onClick=\{navigateBack\("#\/"\)\}/);
});

test("household actions are behind a compact sheet", () => {
  assert.match(appSource, /isHouseholdSheetOpen/);
  assert.match(appSource, /className="user-menu-trigger"/);
  assert.match(appSource, /className="household-sheet"/);
  assert.match(appSource, /t\("household\.settings"\)/);
  assert.doesNotMatch(appSource, /className="household-chip-button"/);
});

test("diagnosis history is newest-first and horizontal on mobile", () => {
  assert.match(appSource, /\.sort\(\(left, right\) => right\.createdAt\.localeCompare\(left\.createdAt\)\)/);
  assert.match(appSource, /className="diagnostic-card-meta"/);
  assert.match(styleSource, /\.diagnostic-history-list\s*\{[\s\S]*display: flex;[\s\S]*overflow-x: auto;[\s\S]*scroll-snap-type: x mandatory;/);
});

test("compact mobile care/status styling is present", () => {
  assert.match(styleSource, /\.status-band\s*\{[\s\S]*repeat\(auto-fit, minmax\(132px, 1fr\)\)/);
  assert.match(styleSource, /\.status-band div\s*\{[\s\S]*grid-template-columns: auto 1fr;[\s\S]*border-radius: 999px;/);
  assert.match(styleSource, /\.care-summary\s*\{[\s\S]*max-width: 62ch;[\s\S]*line-height: 1\.65;/);
  assert.match(styleSource, /\.plant-card-actions button,\s*\.plant-card-actions a\s*\{[\s\S]*min-height: 38px;/);
  assert.match(styleSource, /\.mobile-bottom-nav a,\s*\.mobile-bottom-nav button\s*\{[\s\S]*min-height: 48px;/);
});

test("visible Slovak UI text no longer contains replacement placeholders", () => {
  const brokenFragments = [
    "Sympt?my",
    "?lt?",
    "m?kk?",
    "?kvrny",
    "z?lievka",
    "Sp?? na preh?ad",
    "ulo?en?ch diagnost?k",
    "pr?stup",
    "V?sledok",
    "Sk?s",
    "ulo?i?",
    "sp?tn?",
  ];

  for (const fragment of brokenFragments) {
    assert.doesNotMatch(appSource, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
