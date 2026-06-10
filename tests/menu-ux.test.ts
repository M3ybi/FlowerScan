import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync("src/App.tsx", "utf8");
const authPanelSource = readFileSync("src/components/AuthPanel.tsx", "utf8");
const i18nSource = readFileSync("src/lib/i18n.ts", "utf8");
const repositorySource = readFileSync("src/lib/plantieRepository.ts", "utf8");
const styleSource = readFileSync("src/styles.css", "utf8");

test("bottom navigation renders Menu instead of Account", () => {
  assert.match(appSource, /type MobileBottomNavPage = "plants" \| "diagnose" \| "add" \| "qr" \| "menu"/);
  assert.match(appSource, /href="#\/menu"/);
  assert.match(appSource, /mobile-bottom-nav-action/);
  assert.match(appSource, /const AppTabNav/);
  assert.match(appSource, /className="app-tab-nav"/);
  assert.match(appSource, /t\("dashboard\.addPlant"\)/);
  assert.match(appSource, /t\("nav\.menu"\)/);
  assert.doesNotMatch(appSource, /currentPage="account"/);
  assert.doesNotMatch(i18nSource, /"nav\.account"/);
});

test("desktop tab navigation is available across primary app pages", () => {
  assert.match(appSource, /<AppTabNav currentPage=\{isAddPlantModalOpen \? "add" : "plants"\}/);
  assert.match(appSource, /<AppTabNav currentPage="diagnose"/);
  assert.match(appSource, /<AppTabNav currentPage="qr"/);
  assert.match(appSource, /<AppTabNav currentPage="menu"/);
  assert.match(appSource, /className=\{currentPage === "add" \? "active app-tab-nav-action" : "app-tab-nav-action"\}/);
  assert.match(appSource, /href="#\/qr"[\s\S]*t\("nav\.qr"\)/);
  assert.match(styleSource, /\.app-tab-nav\s*\{/);
  assert.match(styleSource, /@media \(max-width: 780px\)[\s\S]*\.app-tab-nav\s*\{[\s\S]*display: none;/);
});

test("dashboard account access is a user menu trigger without direct sign out", () => {
  const triggerIndex = appSource.indexOf('className="user-menu-trigger"');
  const dashboardSection = appSource.slice(Math.max(0, triggerIndex - 500), appSource.indexOf("{isHouseholdSheetOpen ?", triggerIndex));
  assert.match(dashboardSection, /className="user-menu-trigger"/);
  assert.match(dashboardSection, /setIsHouseholdSheetOpen\(true\)/);
  assert.doesNotMatch(dashboardSection, /<AuthButton|handleAccountSignOut|account-menu|Sign out/);
  assert.doesNotMatch(appSource, /import \{ AuthButton \}/);
});

test("menu has expandable production sections", () => {
  for (const key of ["menu.account", "menu.household", "menu.subscription", "menu.supportLegal"]) {
    assert.match(appSource, new RegExp(`t\\("${key.replace(".", "\\.")}"\\)`));
  }
  assert.match(appSource, /<details className="menu-section" open>/);
  assert.match(appSource, /<details className="menu-section">/);
});

test("logged-out account menu shows auth and hides delete account", () => {
  const accountSection = appSource.slice(appSource.indexOf('t("menu.account")'), appSource.indexOf('t("menu.household")'));
  assert.match(accountSection, /<AuthPanel compact language=\{selectedLanguage\}/);
  assert.match(accountSection, /auth\.isAuthenticated \? \(/);
});

test("logged-in account menu exposes sign out and delete account", () => {
  const accountSection = appSource.slice(appSource.indexOf('t("menu.account")'), appSource.indexOf('t("menu.household")'));
  assert.match(accountSection, /handleAccountSignOut/);
  assert.match(accountSection, /href="#\/delete-account"/);
});

test("guest mode and legacy import UI are not rendered", () => {
  assert.doesNotMatch(authPanelSource, /onGuest|auth\.guest/);
  assert.doesNotMatch(i18nSource, /Continue as guest|Guest mode|Hos\\u0165ovsk\\u00fd re\\u017eim/);
  assert.equal(existsSync("src/components/LegacyMigrationCard.tsx"), false);
  assert.doesNotMatch(appSource, /LegacyMigrationCard|Import current Plantie household|Import legacy household/);
});

test("data source debug controls are not rendered in Menu", () => {
  assert.doesNotMatch(appSource, /data-source-title|Compare legacy vs Supabase|Disable Supabase write mode locally|Current source:/);
});

test("household family section uses email invites and no manual join form", () => {
  const householdSection = appSource.slice(appSource.indexOf('t("menu.household")'), appSource.indexOf('t("menu.subscription")'));
  assert.match(householdSection, /inviteEmail/);
  assert.match(householdSection, /type="email"/);
  assert.match(householdSection, /handleCreateInvite/);
  assert.match(householdSection, /invite\.inviteeEmail/);
  assert.match(householdSection, /Pending email invites/);
  assert.doesNotMatch(householdSection, /Join by invite/);
});

test("signed-in users without a Supabase household can create one or join by invite token", () => {
  const householdSection = appSource.slice(appSource.indexOf('t("menu.household")'), appSource.indexOf('t("menu.subscription")'));
  assert.match(householdSection, /auth\.isAuthenticated && isSupabaseBackend/);
  assert.match(householdSection, /handleCreateHousehold/);
  assert.match(householdSection, /t\("household\.createFirstBody"\)/);
  assert.match(householdSection, /joinInviteInput/);
  assert.match(householdSection, /handleJoinInvite\(\)/);
  assert.match(householdSection, /t\("household\.inviteToken"\)/);
});

test("household family section renders Supabase household members", () => {
  const householdSection = appSource.slice(appSource.indexOf('t("menu.household")'), appSource.indexOf('t("menu.subscription")'));
  assert.match(appSource, /listHouseholdMembers/);
  assert.match(repositorySource, /rpc\("list_household_members"/);
  assert.match(householdSection, /className="household-member-list"/);
  assert.match(householdSection, /member\.email/);
});

test("role select uses styled dropdown controls", () => {
  assert.match(styleSource, /\.field select\s*\{/);
  assert.match(styleSource, /appearance: none;/);
  assert.match(styleSource, /linear-gradient/);
});

test("menu language strings are translated and not mojibake", () => {
  const householdSection = appSource.slice(appSource.indexOf('t("menu.household")'), appSource.indexOf('t("menu.subscription")'));
  assert.match(householdSection, /t\("household\.members"\)/);
  assert.match(householdSection, /t\("household\.inviteEmail"\)/);
  assert.match(householdSection, /t\("household\.createEmailInvite"\)/);
  assert.match(householdSection, /t\("household\.revokeInvite"\)/);
  assert.doesNotMatch(`${appSource}\n${i18nSource}`, /[\uFFFD\u00C2\u0102\u0139\u00C4]|\u00E2\u20AC/);
});

test("pending invite route has accept and decline actions", () => {
  const joinRouteStart = appSource.indexOf('if (route.page === "join") {\r\n    return') >= 0
    ? appSource.indexOf('if (route.page === "join") {\r\n    return')
    : appSource.indexOf('if (route.page === "join") {\n    return');
  const joinRoute = appSource.slice(joinRouteStart, appSource.indexOf('if (route.page === "legal"', joinRouteStart));
  assert.match(joinRoute, /handleJoinInvite/);
  assert.match(joinRoute, /declinePendingInvite/);
});

test("dashboard remains blocked before auth and household", () => {
  assert.match(appSource, /!activeHousehold && !supabaseReadState && !isRouteAllowedWithoutHousehold/);
  assert.match(appSource, /<AuthPanel compact language=\{selectedLanguage\} onSuccess=\{continueToHouseholdSetup\}/);
  assert.match(appSource, /setAccessStatus/);
});

test("QR labels live in app tab navigation instead of Menu content", () => {
  const menuRoute = appSource.slice(appSource.indexOf('if (route.page === "menu")'), appSource.indexOf('if (route.page === "diagnose")'));
  assert.match(appSource, /<AppTabNav currentPage="qr" onAddPlant=\{openAddPlantFromMobileNav\}/);
  assert.match(appSource, /href="#\/qr"[\s\S]*t\("nav\.qr"\)/);
  assert.doesNotMatch(menuRoute, /t\("menu\.qr"\)/);
  assert.doesNotMatch(menuRoute, /handleQrPdfExport/);
});

test("app footer provides secondary navigation", () => {
  assert.match(appSource, /const AppFooter/);
  assert.match(appSource, /<AppFooter t=\{t\} \/>/);
  assert.match(styleSource, /\.app-footer\s*\{/);
});

test("changing household can restore the previous logged-in household", () => {
  assert.match(appSource, /previousHousehold/);
  assert.match(appSource, /const restorePreviousHousehold = \(\) =>/);
  assert.match(appSource, /storeHouseholdSession\(previousHousehold\)/);
  assert.match(appSource, /className="neutral-action access-return-action"/);
});
