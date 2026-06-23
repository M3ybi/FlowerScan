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

test("dashboard account access opens the household sheet with account actions", () => {
  const dashboardTrigger = appSource.slice(appSource.indexOf("const renderHeroActions"), appSource.indexOf("const renderHouseholdSheet"));
  const householdSheet = appSource.slice(appSource.indexOf("const renderHouseholdSheet"), appSource.indexOf("const renderHouseholdLoading"));

  assert.match(dashboardTrigger, /className="user-menu-trigger"/);
  assert.match(dashboardTrigger, /setIsHouseholdSheetOpen\(true\)/);
  assert.doesNotMatch(dashboardTrigger, /<AuthButton|handleAccountSignOut|account-menu|Sign out/);
  assert.match(householdSheet, /className="household-sheet-email"/);
  assert.match(householdSheet, /renderHouseholdNameEditor\("sheet", "household-sheet-title"\)/);
  assert.match(householdSheet, /handleAccountSignOut/);
  assert.doesNotMatch(appSource, /import \{ AuthButton \}/);
});

test("menu has expandable production sections", () => {
  for (const key of ["menu.account", "menu.household", "menu.subscription", "menu.supportLegal"]) {
    assert.match(appSource, new RegExp(`t\\("${key.replace(".", "\\.")}"\\)`));
  }
  assert.match(appSource, /openMenuSection === "account"/);
  assert.match(appSource, /openMenuSection === "household"/);
  assert.match(appSource, /#\/menu\?section=household/);
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
  assert.doesNotMatch(householdSection, /inviteExpiresAt|datetime-local|inviteStatusExpires/);
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
  assert.match(repositorySource, /rpc\("remove_household_viewer"/);
  assert.match(repositorySource, /rpc\("rename_household"/);
  assert.match(householdSection, /className="household-member-list"/);
  assert.match(householdSection, /member\.email/);
  assert.match(householdSection, /isCurrentHouseholdOwner && member\.role === "viewer"/);
  assert.match(householdSection, /handleRemoveViewer\(member\)/);
  assert.match(householdSection, /renderHouseholdNameEditor\("menu"\)/);
});

test("household rename UI is owner-gated and localized", () => {
  assert.match(appSource, /const canRenameHousehold = auth\.isAuthenticated && Boolean\(activeSupabaseHouseholdId\) && isCurrentHouseholdOwner/);
  assert.match(appSource, /className="household-name-edit-trigger"/);
  assert.match(appSource, /t\("household\.renameAction"\)/);
  assert.match(appSource, /t\("household\.renameRequired"\)/);
  assert.match(appSource, /t\("household\.renameTooLong"/);
  assert.match(appSource, /t\("household\.renameUnsafe"\)/);
  assert.match(appSource, /renameHousehold\(activeSupabaseHouseholdId, nameValidation\.name\)/);
});

test("transient UI feedback is cleared on route, auth, and household changes", () => {
  assert.match(appSource, /const clearTransientMessages = \(\) => \{/);
  for (const setter of [
    "setAccessStatus",
    "setAccountActionStatus",
    "setCarePreviewStatus",
    "setCreatedInviteLink",
    "setDeleteAccountStatus",
    "setDiagnosisStatus",
    "setHouseholdNameEditStatus",
    "setInviteStatus",
    "setNewPlantStatus",
    "setOnboardingStatus",
    "setQrExportStatus",
    "setQuickRecordStatus",
  ]) {
    assert.match(appSource, new RegExp(`${setter}\\(""\\)`));
  }

  assert.match(appSource, /const routeLifecycleKey =[\s\S]*route\.page === "menu"[\s\S]*route\.section/);
  assert.match(appSource, /useEffect\(\(\) => \{\s*clearTransientMessages\(\);\s*\}, \[routeLifecycleKey\]\)/);
  assert.match(appSource, /const householdLifecycleKey = activeSupabaseHouseholdId \|\| activeHousehold\?\.publicToken \|\| ""/);
  assert.match(appSource, /useEffect\(\(\) => \{\s*clearTransientMessages\(\);\s*\}, \[householdLifecycleKey\]\)/);
  assert.match(appSource, /previousAuthUserIdRef\.current = nextUserId;\s*clearTransientMessages\(\);/);
  assert.match(appSource, /householdPlanUsageHouseholdId === activeSupabaseHouseholdId \? householdPlanUsage : null/);
  assert.match(appSource, /setHouseholdPlanUsageHouseholdId\(""\)/);
  assert.match(appSource, /activeSupabaseHouseholdIdRef\.current === householdId/);
  assert.doesNotMatch(appSource, /setAccountActionStatus\(t\("account\.signedOut"\)\)/);
});

test("household member management is visually distinct from account summaries", () => {
  const householdSection = appSource.slice(appSource.indexOf('t("menu.household")'), appSource.indexOf('t("menu.subscription")'));

  assert.match(householdSection, /className="household-member-management"/);
  assert.match(householdSection, /className="household-member-management-head"/);
  assert.match(styleSource, /\.account-summary-list > div\s*\{/);
  assert.match(styleSource, /\.household-member-management\s*\{[\s\S]*rgba\(45, 83, 100, 0\.2\)/);
  assert.match(styleSource, /\.household-member-list > div\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.doesNotMatch(styleSource, /\.household-member-list div\s*\{/);
  assert.doesNotMatch(styleSource, /\.account-summary-list div\s*\{/);
});

test("global stylesheet exposes design tokens and keeps label typography readable", () => {
  for (const token of ["--space-1", "--space-4", "--radius-md", "--z-nav", "--z-modal"]) {
    assert.match(styleSource, new RegExp(`${token}:`));
  }

  assert.match(styleSource, /z-index: var\(--z-modal\)/);
  assert.match(styleSource, /z-index: var\(--z-nav\)/);
  assert.doesNotMatch(styleSource, /letter-spacing: 0\.[0-9]+em/);
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

test("primary navigation provides secondary app routes", () => {
  assert.match(appSource, /const AppTabNav/);
  assert.match(appSource, /<MobileBottomNav/);
  assert.match(styleSource, /\.app-tab-nav\s*\{/);
  assert.match(styleSource, /\.mobile-bottom-nav\s*\{/);
});

test("changing household can restore the previous logged-in household", () => {
  assert.match(appSource, /previousHousehold/);
  assert.match(appSource, /const restorePreviousHousehold = \(\) =>/);
  assert.match(appSource, /storeHouseholdSession\(previousHousehold\)/);
  assert.match(appSource, /className="neutral-action access-return-action"/);
});
