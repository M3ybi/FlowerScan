import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { LoggedOutMenu } from "../../src/components/LoggedOutMenu";
import { createTranslator } from "../../src/lib/i18n";
import { supportedLanguages, writeStoredLanguage, onboardingLanguageStorageKey } from "../../src/lib/onboarding";
import type { PlantieLanguage } from "../../src/lib/onboarding";
import { minimumAuthPasswordLength } from "../../src/lib/authRules";
import packageMetadata from "../../package.json";

type Section = "account" | "household" | "subscription" | "language" | "support" | "about";
type AuthBoundary = { calls: Array<{ kind: string; email: string | null; passwordLength: number }>;
  hold: boolean; release: (() => void) | null; failNext: boolean };
const auth = (globalThis as typeof globalThis & { __loggedOutMenuFixtureAuth: AuthBoundary }).__loggedOutMenuFixtureAuth;
const parameters = new URLSearchParams(location.search);
const scene = parameters.get("scene") ?? "account";
const unavailable = parameters.has("auth-unavailable");
let controls: { setJoining: (joining: boolean) => void; setInviteStatus: (status: string) => void } | null = null;
const callbacks = { authSuccess: 0, addPlant: 0, inviteValues: [] as string[], languages: [] as PlantieLanguage[] };
const Fixture = () => {
  const [language, setLanguage] = useState<PlantieLanguage>("en");
  const [inviteInput, setInviteInput] = useState("");
  const [isJoiningInvite, setJoining] = useState(false);
  const [inviteStatus, setInviteStatus] = useState("");
  controls = { setJoining, setInviteStatus };
  return <LoggedOutMenu language={language} onLanguageChange={(code) => {
    callbacks.languages.push(code); writeStoredLanguage(localStorage, code); setLanguage(code);
  }} inviteInput={inviteInput} onInviteInputChange={setInviteInput} onContinueInvite={() => callbacks.inviteValues.push(inviteInput)}
    isJoiningInvite={isJoiningInvite} inviteStatus={inviteStatus} inviteStatusClass="report-status"
    onAuthSuccess={() => { callbacks.authSuccess += 1; }} onAddPlant={() => { callbacks.addPlant += 1; }}
    initialSection={scene === "initial-household" ? "household" : "account"} />;
};
const result = { checks: [] as string[], failures: [] as string[], scene, viewport: { width: innerWidth, height: innerHeight },
  measurements: [] as Array<{ section: Section; scrollWidth: number; clientWidth: number }>,
  limitations: ["Synthetic email/password values and programmatic DOM events; no real registration, email, session, OAuth redirect, or trusted keyboard/device input.",
    "Real Menu/AuthPanel/navigation/styles and web package version; auth service/config boundaries substituted. Fixture parent models controlled language/invite callbacks, not full App routing or persistence integration.",
    "Exact CSS iframe widths; native version plugins and physical safe-area insets are not exercised."] };
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const check = (message: string, run: () => void) => { run(); result.checks.push(message); };
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const waitFor = async (condition: () => unknown, label: string) => {
  for (let attempt = 0; attempt < 400; attempt += 1) { if (condition()) return; await tick(); }
  throw new Error(`Timed out waiting for ${label}`);
};
const panel = (name: Section) => document.querySelector<HTMLDivElement>(`[id$="-${name}-panel"]`)!;
const header = (name: Section) => document.querySelector<HTMLButtonElement>(`button[aria-controls$="-${name}-panel"]`)!;
const authPanel = () => document.querySelector<HTMLElement>(".auth-panel-menu")!;
const authForm = () => authPanel().querySelector<HTMLFormElement>("form")!;
const authStatus = () => authPanel().querySelector<HTMLElement>(".report-status")?.textContent ?? "";
const tab = (mode: "register" | "login" | "reset") => authPanel().querySelector<HTMLButtonElement>(`[role=tab][id$="-${mode}"]`)!;
const email = () => authPanel().querySelector<HTMLInputElement>('input[autocomplete="email"]')!;
const password = () => authPanel().querySelector<HTMLInputElement>('input[id$="-password"]')!;
const confirmation = () => authPanel().querySelector<HTMLInputElement>('input[id$="-confirmation"]')!;
const submit = () => authForm().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
const setInput = async (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await tick();
};
const openSection = async (name: Section) => {
  if (panel(name).hidden) { header(name).click(); await waitFor(() => !panel(name).hidden, `open ${name}`); }
  await tick();
};
const assertNoOverflow = (name: Section) => {
  const scrolling = document.scrollingElement!;
  result.measurements.push({ section: name, scrollWidth: scrolling.scrollWidth, clientWidth: scrolling.clientWidth });
  assert(scrolling.scrollWidth <= scrolling.clientWidth + 1, `${name} causes horizontal document overflow`);
  for (const element of panel(name).querySelectorAll<HTMLElement>("input,button,a,article")) {
    if (!element.getClientRects().length) continue;
    const bounds = element.getBoundingClientRect();
    assert(bounds.left >= -1 && bounds.right <= innerWidth + 1, `${name} ${element.tagName} escapes viewport (${bounds.left},${bounds.right})`);
  }
};
const setMode = async (mode: "register" | "login" | "reset") => {
  await waitFor(() => !tab(mode).disabled, `enabled ${mode} tab`);
  tab(mode).click(); await waitFor(() => tab(mode).getAttribute("aria-selected") === "true", `auth ${mode}`);
};
const assertStatus = async (key: Parameters<ReturnType<typeof createTranslator>>[0]) => {
  const expected = createTranslator("en")(key); await waitFor(() => authStatus() === expected, `auth status ${key}`);
};
const run = async () => {
  createRoot(document.getElementById("root")!).render(<StrictMode><Fixture /></StrictMode>);
  await waitFor(() => controls && document.querySelectorAll(".menu-hub-section-header").length === 6, "Menu mount");
  const sections: Section[] = ["account", "household", "subscription", "language", "support", "about"];
  check("six ordered semantic accordion headers have unique accessible panel relationships", () => {
    const headers = Array.from(document.querySelectorAll<HTMLButtonElement>(".menu-hub-section-header"));
    assert(headers.length === 6 && headers.every((control, index) => control === header(sections[index])), "Section order changed");
    for (const name of sections) assert(header(name).type === "button" && panel(name).getAttribute("aria-labelledby") === header(name).id
      && header(name).getAttribute("aria-expanded") === String(!panel(name).hidden), `${name} ARIA relationship invalid`);
    for (const name of sections) {
      header(name).focus(); assert(document.activeElement === header(name), `${name} header cannot receive keyboard focus`);
      const bounds = header(name).getBoundingClientRect();
      assert(bounds.height >= 44 && bounds.width >= 44, `${name} header is not a usable touch target`);
    }
    const ids = Array.from(document.querySelectorAll("[id]")).map(element => element.id);
    assert(new Set(ids).size === ids.length, "Duplicate IDs");
  });
  check("only actual existing top and mobile navigations are mounted", () => {
    assert(document.querySelectorAll("nav").length === 2 && document.querySelectorAll(".app-tab-nav").length === 1
      && document.querySelectorAll(".mobile-bottom-nav").length === 1, "Duplicate or missing navigation");
    const visible = Array.from(document.querySelectorAll("nav")).filter(nav => getComputedStyle(nav).display !== "none");
    assert(visible.length === 1, "Navigation variants must not both be visible");
    assert(visible[0].querySelector('a.active')?.getAttribute("href") === "#/menu", "Menu active route missing");
    visible[0].querySelector<HTMLButtonElement>("button")!.click();
    assert(callbacks.addPlant === 1, "Add-plant navigation callback changed");
  });
  if (scene === "initial-household") check("invitation entry initially opens Household", () => assert(!panel("household").hidden, "Household entry was ignored"));
  await openSection("account");
  check("real auth form is mounted with three accessible tabs and labeled inputs", () => {
    assert(authPanel().querySelectorAll('[role="tab"]').length === 3 && authForm().getAttribute("role") === "tabpanel", "Auth tabs missing");
    for (const input of authForm().querySelectorAll<HTMLInputElement>("input"))
      assert(input.id && authForm().querySelector(`label[for="${input.id}"]`), "Auth input lacks an associated label");
    assert(password().minLength === minimumAuthPasswordLength && password().autocomplete === "new-password", "Real password constraints changed");
  });
  check("only Google is an enabled OAuth option; planned providers are disabled", () => {
    const providers = authPanel().querySelectorAll<HTMLButtonElement>(".auth-provider-list button");
    assert(providers.length === 3 && providers[0].disabled === unavailable && providers[1].disabled && providers[2].disabled, "Provider availability is inaccurate");
    assert(/coming soon/i.test(providers[1].textContent ?? "") && /coming soon/i.test(providers[2].textContent ?? ""), "Planned providers lack explanation");
    providers[1].click(); providers[2].click(); assert(auth.calls.length === 0, "Disabled provider called auth boundary");
  });
  if (unavailable) {
    check("unconfigured auth is factual and fails closed", () => assert(authForm().querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled
      && Boolean(authPanel().querySelector(".auth-unavailable-note[role=status]")), "Missing unavailable state"));
  } else {
    await setInput(email(), "not-an-email"); await setInput(password(), "short"); await setInput(confirmation(), "short"); submit();
    await assertStatus("auth.error.invalid_email");
    check("invalid email validation stops auth I/O", () => assert(auth.calls.length === 0, "Invalid email reached boundary"));
    await setInput(email(), " Fixture@Example.Test "); submit();
    await assertStatus("auth.error.weak_password");
    check("weak password validation stops auth I/O", () => assert(auth.calls.length === 0, "Weak registration reached boundary"));
    await setInput(password(), "Fixture-password-8"); await setInput(confirmation(), "Other-password-8"); submit();
    await assertStatus("auth.error.password_mismatch");
    check("confirmation mismatch validation stops auth I/O", () => assert(auth.calls.length === 0, "Mismatch reached boundary"));
    await setInput(confirmation(), "Fixture-password-8");
    const visibility = authPanel().querySelector<HTMLButtonElement>('button[aria-controls$="-password"]')!;
    visibility.click(); await tick();
    check("password visibility control changes only presentation", () => assert(password().type === "text" && password().value === "Fixture-password-8"
      && visibility.getAttribute("aria-pressed") === "true", "Password visibility changed state"));
    visibility.click(); await tick(); auth.hold = true; submit();
    await waitFor(() => auth.calls.length === 1 && auth.release, "held registration"); submit(); await tick();
    check("pending registration prevents duplicate submissions and disables auth tabs", () => assert(auth.calls.length === 1
      && Array.from(authPanel().querySelectorAll<HTMLButtonElement>('[role="tab"]')).every(control => control.disabled), "Pending auth was duplicated"));
    await openSection("household"); await openSection("account");
    check("form values and pending auth survive other accordion interactions", () => assert(password().value === "Fixture-password-8"
      && confirmation().value === "Fixture-password-8" && tab("register").getAttribute("aria-selected") === "true", "Account state remounted"));
    auth.hold = false; auth.release!(); await assertStatus("auth.accountCreated");
    check("registration normalizes email and requests confirmation rather than claiming a session", () => assert(auth.calls[0].kind === "register"
      && auth.calls[0].email === "fixture@example.test" && callbacks.authSuccess === 0, "Registration callback contract changed"));
    check("successful registration clears password fields and retains email", () => assert(password().value === "" && confirmation().value === ""
      && email().value.toLowerCase().trim() === "fixture@example.test", "Sensitive fields not cleared correctly"));
    await openSection("household"); await openSection("account");
    check("registration success state survives collapsing and reopening Account", () => assert(authStatus() === createTranslator("en")("auth.accountCreated"), "Auth status reset by accordion"));
    tab("register").focus(); tab("register").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true })); await tick();
    check("auth tab arrow handler moves selection and focus", () => assert(tab("login").getAttribute("aria-selected") === "true"
      && document.activeElement === tab("login"), "Arrow tab behavior failed"));
    tab("login").dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true })); await tick();
    check("auth tab End handler selects and focuses the last tab", () => assert(tab("reset").getAttribute("aria-selected") === "true"
      && document.activeElement === tab("reset"), "End tab behavior failed"));
    tab("reset").dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true })); await tick();
    check("auth tab Home handler selects and focuses the first tab", () => assert(tab("register").getAttribute("aria-selected") === "true"
      && document.activeElement === tab("register"), "Home tab behavior failed"));
    await setMode("login");
    check("login keeps email and uses current-password autofill", () => assert(email().value.toLowerCase().trim() === "fixture@example.test"
      && password().autocomplete === "current-password" && !confirmation(), "Login fields inaccurate"));
    await setInput(password(), "Fixture-password-8"); auth.failNext = true; submit(); await assertStatus("auth.failed");
    check("auth boundary failure remains visible without reporting success", () => assert(callbacks.authSuccess === 0 && password().value !== "", "Failure reported success or destroyed retry data"));
    submit(); await assertStatus("auth.signedIn");
    check("successful email login calls parent exactly once and clears password", () => assert(callbacks.authSuccess === 1 && password().value === "", "Login callback changed"));
    await setMode("reset");
    check("reset mode has only the email field", () => assert(authForm().querySelectorAll("input").length === 1, "Reset includes password fields"));
    submit(); await assertStatus("auth.resetSent");
    check("reset submits the real boundary and does not report authenticated success", () => assert(auth.calls.at(-1)?.kind === "reset"
      && callbacks.authSuccess === 1, "Reset callback contract changed"));
    auth.failNext = true; authPanel().querySelector<HTMLButtonElement>(".auth-google-button")!.click(); await assertStatus("auth.googleFailed");
    check("Google failure remains actionable without changing auth state", () => assert(auth.calls.at(-1)?.kind === "google" && callbacks.authSuccess === 1, "Google failure changed session"));
    authPanel().querySelector<HTMLButtonElement>(".auth-google-button")!.click();
    await tick();
    await waitFor(() => auth.calls.filter(call => call.kind === "google").length === 2 && !tab("reset").disabled, "Google boundary completion");
    check("Google uses existing web auth boundary without a synthetic session claim", () => assert(callbacks.authSuccess === 1, "Google stub was presented as live login"));
    await setMode("login"); await setInput(password(), "Fixture-password-8");
  }
  for (const name of sections) {
    await openSection(name);
    check(`${name} expands with a semantic button and accurate ARIA state`, () => assert(header(name).getAttribute("aria-expanded") === "true" && !panel(name).hidden, "Accordion did not open"));
    check(`${name} has no horizontal overflow at ${innerWidth}px`, () => assertNoOverflow(name));
    header(name).click(); await tick();
    check(`${name} collapses without unmounting its panel`, () => assert(panel(name).hidden && header(name).getAttribute("aria-expanded") === "false", "Accordion did not close"));
  }
  await openSection("account");
  if (!unavailable) check("selected login mode and typed password survive all six sections", () => assert(tab("login").getAttribute("aria-selected") === "true"
    && password().value === "Fixture-password-8", "Account state was lost"));
  await openSection("household");
  check("household explanation contains Owner/Viewer without fabricated personal data or Editor", () => {
    const text = panel("household").textContent ?? "";
    assert(/Owner/.test(text) && /Viewer/.test(text) && !/Editor|Petzvalova|ghust664|fedorcor28|2\s*\/\s*3/.test(text), "Household contains misleading roles or personal data");
    assert(/active members/i.test(text) && /pending invit/i.test(text) && /3/.test(text), "Occupied-slot explanation missing");
  });
  const invite = panel("household").querySelector<HTMLInputElement>("input")!;
  const syntheticInvite = "https://fixture.example.test/#/join?invite=synthetic-fixture-token";
  await setInput(invite, syntheticInvite);
  panel("household").querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  check("manual invite callback receives the unchanged controlled input", () => assert(callbacks.inviteValues.at(-1) === syntheticInvite, "Invite callback altered input"));
  controls!.setJoining(true); controls!.setInviteStatus("Synthetic invitation request is pending."); await tick();
  check("parent invite pending/status state remains visible and prevents repeated controls", () => assert(invite.disabled
    && panel("household").querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled
    && /Synthetic invitation/.test(panel("household").querySelector('[role="status"]')?.textContent ?? ""), "Invite pending contract changed"));
  controls!.setJoining(false); controls!.setInviteStatus(""); await tick();
  await setInput(invite, "");
  await openSection("subscription");
  check("available plans are factual informational cards with no guessed price or billing rows", () => {
    const text = panel("subscription").textContent ?? "";
    assert(/Free/.test(text) && /Monthly/.test(text) && /Yearly/.test(text), "Available plan names missing");
    assert(!/[€$]|\b(?:3\.99|39\.99|29\.99)\b|Current household plan|Your current plan|October 6, 2026/.test(text), "Subscription contains fictional current data or price");
    assert(!panel("subscription").querySelector("button,input,.billing-history-card"), "Logged-out billing controls or fake history appeared");
  });
  await openSection("language");
  check("language choices exactly match actual supported configuration and remain touch-friendly", () => {
    const choices = panel("language").querySelectorAll<HTMLButtonElement>(".menu-hub-language-grid button");
    assert(choices.length === supportedLanguages.length, "Language count differs");
    for (const choice of choices) {
      const bounds = choice.getBoundingClientRect();
      assert(bounds.height >= 44 && bounds.width >= 44, "Language choice is not a usable touch target");
    }
  });
  for (const option of supportedLanguages) {
    const choices = Array.from(panel("language").querySelectorAll<HTMLButtonElement>(".menu-hub-language-grid button"));
    choices[supportedLanguages.findIndex(candidate => candidate.code === option.code)].click(); await tick();
    check(`${option.code} updates navigation and selected language immediately`, () => {
      assert(choices[supportedLanguages.findIndex(candidate => candidate.code === option.code)].getAttribute("aria-pressed") === "true", "Selected language inaccurate");
      assert(document.querySelector('.app-tab-nav a[href="#/"]')?.textContent === createTranslator(option.code)("nav.plants"), "Navigation did not translate");
      assert(localStorage.getItem(onboardingLanguageStorageKey) === option.code && callbacks.languages.at(-1) === option.code, "Language callback contract changed");
      assert(panel("language").querySelector(".menu-hub-language-preview strong")?.textContent?.includes(createTranslator(option.code)("nav.plants")), "Language preview did not translate");
      const previewTime = panel("language").querySelector<HTMLTimeElement>("time")!;
      assert(previewTime.textContent === new Intl.DateTimeFormat(option.code, { dateStyle: "long" }).format(new Date(previewTime.dateTime)), "Locale date preview differs");
    });
    check(`${option.code} localized form and information have no horizontal overflow`, () => { assertNoOverflow("language"); });
    for (const name of ["account", "household", "subscription"] as const) {
      await openSection(name);
      check(`${option.code} ${name} stays within the viewport`, () => assertNoOverflow(name));
    }
    await openSection("language");
  }
  panel("language").querySelector<HTMLButtonElement>(".menu-hub-language-grid button")!.click(); await tick();
  await openSection("account");
  if (!unavailable) check("auth fields survive the language rerenders", () => assert(email().value.trim().toLowerCase() === "fixture@example.test"
    && password().value === "Fixture-password-8" && tab("login").getAttribute("aria-selected") === "true", "Language change reset auth fields"));
  await openSection("support");
  check("support exposes only the real in-app destination, without invented contact channels", () => {
    const links = Array.from(panel("support").querySelectorAll<HTMLAnchorElement>("a"));
    assert(links.length > 0 && links.every(link => link.getAttribute("href") === "#/support"), "Unsupported support link");
    assert(!/24\/7|live chat|mailto:|support@plantie/.test(panel("support").innerHTML), "Invented support channel");
  });
  await openSection("about");
  await waitFor(() => document.querySelector(".menu-hub-version strong")?.textContent === packageMetadata.version, "actual web version");
  check("About displays the real package version dynamically", () => assert(document.querySelector(".menu-hub-version strong")?.textContent === packageMetadata.version, "Web version differs from package"));
  check("About legal links point at actual application routes", () => {
    const routes = Array.from(panel("about").querySelectorAll<HTMLAnchorElement>("a")).map(link => link.getAttribute("href"));
    assert(routes.includes("#/privacy") && routes.includes("#/terms") && routes.includes("#/subscription-terms"), "About links are placeholders");
  });
  check("responsive menu uses two desktop columns and one compact column", () => {
    const accountBounds = document.querySelector<HTMLElement>(".menu-hub-account")!.getBoundingClientRect();
    const informationBounds = document.querySelector<HTMLElement>(".menu-hub-information")!.getBoundingClientRect();
    if (innerWidth > 900) assert(informationBounds.left >= accountBounds.right - 1 && accountBounds.width >= 280, "Desktop columns do not share width");
    else assert(Math.abs(accountBounds.left - informationBounds.left) <= 2 && informationBounds.top >= accountBounds.top, "Compact layout is not one column");
  });
  if (innerWidth <= 900) check("compact accordions have at most one information section expanded", () => assert(sections.slice(1).filter(name => !panel(name).hidden).length <= 1, "Compact information sections all expanded"));
  const scrolling = document.scrollingElement!; scrolling.scrollTop = scrolling.scrollHeight; await tick();
  check("last expanded legal action can scroll clear of fixed bottom navigation", () => {
    const last = Array.from(panel("about").querySelectorAll<HTMLAnchorElement>("a")).at(-1)!;
    const nav = document.querySelector<HTMLElement>(".mobile-bottom-nav")!;
    if (getComputedStyle(nav).display !== "none") assert(last.getBoundingClientRect().bottom < nav.getBoundingClientRect().top - 4, "Bottom navigation covers final content");
  });
  // Leave each named scenario in a useful reviewable screenshot state after all
  // behavior checks. Synthetic credentials are cleared before capturing.
  await openSection("account"); await setMode("register"); await setInput(email(), "");
  const finalSection: Section = sections.includes(scene as Section) ? scene as Section : scene === "initial-household" ? "household" : "account";
  for (const name of sections) if (name !== "account" && name !== finalSection && !panel(name).hidden) { header(name).click(); await tick(); }
  await openSection(finalSection);
  if (finalSection !== "account") header(finalSection).scrollIntoView({ block: "start", behavior: "auto" });
  else scrolling.scrollTop = 0;
  await tick();
};
void run().catch(error => { result.failures.push(error instanceof Error ? error.message : "Fixture failed"); })
  .finally(() => { document.getElementById("logged-out-menu-browser-results")!.textContent = JSON.stringify(result); });
