import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { LoggedOutMenu } from "../../src/components/LoggedOutMenu";
import { createTranslator } from "../../src/lib/i18n";
import { supportedLanguages, writeStoredLanguage, onboardingLanguageStorageKey } from "../../src/lib/onboarding";
import type { PlantieLanguage } from "../../src/lib/onboarding";
import { minimumAuthPasswordLength } from "../../src/lib/authRules";
import { authPanelCopy, authPanelNoticeContent } from "../../src/lib/authPanelCopy";
import type { AuthNoticeKey } from "../../src/lib/authPanelCopy";
import { loggedOutMenuCopy } from "../../src/lib/loggedOutMenuCopy";
import packageMetadata from "../../package.json";

type Section = "account" | "household" | "subscription" | "language" | "support" | "about";
type AuthBoundary = { calls: Array<{ kind: string; email: string | null; passwordLength: number }>;
  hold: boolean; release: (() => void) | null; failNext: boolean };
const auth = (globalThis as typeof globalThis & { __loggedOutMenuFixtureAuth: AuthBoundary }).__loggedOutMenuFixtureAuth;
const parameters = new URLSearchParams(location.search);
const scene = parameters.get("scene") ?? "account";
const unavailable = parameters.has("auth-unavailable");
let controls: { setJoining: (joining: boolean) => void; setInviteStatus: (status: string) => void } | null = null;
const callbacks = { authSuccess: 0, inviteValues: [] as string[], languages: [] as PlantieLanguage[] };
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
    onAuthSuccess={() => { callbacks.authSuccess += 1; }}
    initialSection={scene === "initial-household" ? "household" : "account"} />;
};
const result = { checks: [] as string[], failures: [] as string[], scene, viewport: { width: innerWidth, height: innerHeight },
  measurements: [] as Array<{ section: Section; scrollWidth: number; clientWidth: number }>,
  limitations: ["Synthetic email/password values and programmatic DOM events; no real registration, email, session, OAuth redirect, or trusted keyboard/device input.",
    "Real self-contained Menu/AuthPanel/styles and web package version; auth service/config boundaries substituted. Fixture parent models controlled language/invite callbacks, not full App routing or persistence integration.",
    "Exact CSS iframe widths and temporarily reduced viewport height; not software keyboard emulation, native version plugins, or physical safe-area insets."] };
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
const authStatus = () => authPanel().querySelector<HTMLElement>(".auth-message-content > p")?.textContent ?? "";
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
const sections: Section[] = ["account", "household", "subscription", "language", "support", "about"];
const assertSingleExpanded = () => {
  assert(sections.filter(name => !panel(name).hidden).length <= 1, "More than one section is expanded");
  for (const name of sections) assert(header(name).getAttribute("aria-expanded") === String(!panel(name).hidden), `${name} expansion ARIA disagrees with visibility`);
};
const openSection = async (name: Section) => {
  if (panel(name).hidden) { header(name).click(); await waitFor(() => !panel(name).hidden, `open ${name}`); }
  await tick();
  assertSingleExpanded();
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
const assertStatus = async (key: AuthNoticeKey) => {
  const expected = authPanelNoticeContent(key, "en");
  await waitFor(() => authStatus() === expected.body
    && authPanel().querySelector(".auth-message-content > strong")?.textContent === expected.title, `auth notice ${key}`);
};
const assertFieldMessage = async (field: () => HTMLInputElement, expected: string) => {
  await waitFor(() => field().getAttribute("aria-invalid") === "true"
    && (field().getAttribute("aria-describedby") ?? "").split(/\s+/).some(id => document.getElementById(id)?.textContent === expected), `inline ${expected}`);
  const associatedError = (field().getAttribute("aria-describedby") ?? "").split(/\s+/)
    .map(id => document.getElementById(id)).find(element => element?.textContent === expected)!;
  assert(field().closest(".auth-menu-field")?.contains(associatedError), "Field error is not near its input");
};
const assertFieldError = (field: () => HTMLInputElement, key: Parameters<ReturnType<typeof createTranslator>>[0]) =>
  assertFieldMessage(field, createTranslator("en")(key));
const assertRequestDisabled = (mode: "register" | "login" | "reset") => {
  assert(Array.from(authPanel().querySelectorAll<HTMLInputElement>("input")).every(input => input.disabled), "Request left an auth input enabled");
  const action = authForm().querySelector<HTMLButtonElement>('button[type="submit"]')!;
  assert(action.disabled && action.getAttribute("aria-busy") === "true" && action.querySelector(".button-label")?.textContent === authPanelCopy("en").loading[mode], "Missing mode-specific loading action");
  assert(Array.from(authPanel().querySelectorAll<HTMLButtonElement>("button")).every(control => control.disabled), "Request left an auth button enabled");
};
const run = async () => {
  createRoot(document.getElementById("root")!).render(<StrictMode><Fixture /></StrictMode>);
  await waitFor(() => controls && document.querySelectorAll(".menu-hub-section-header").length === 6, "Menu mount");
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
  check("signed-out Menu omits app navigation, mailbox and active-household controls entirely", () => {
    assert(!document.querySelector(".app-tab-nav,.mobile-bottom-nav,nav,.invitation-inbox-trigger,.household-switcher,.household-invitation-inbox"), "Authenticated controls are mounted");
    assert(!document.querySelector('a[href="#/"],a[href="#/diagnose"],a[href="#/qr"]'), "Signed-out Menu links into authenticated app areas");
  });
  check("default entry opens exactly Account, while invitation entry prioritizes exactly Household", () => {
    const expected: Section = scene === "initial-household" ? "household" : "account";
    assert(sections.filter(name => !panel(name).hidden).join() === expected, "Initial section is inaccurate");
    assertSingleExpanded();
  });
  await openSection("account");
  const retainedEmail = email();
  check("real auth form is mounted with three accessible tabs and labeled inputs", () => {
    assert(authPanel().querySelectorAll('[role="tab"]').length === 3 && authForm().getAttribute("role") === "tabpanel", "Auth tabs missing");
    for (const input of authForm().querySelectorAll<HTMLInputElement>("input"))
      assert(input.id && authForm().querySelector(`label[for="${input.id}"]`), "Auth input lacks an associated label");
    assert(email().type === "email" && email().autocomplete === "email" && email().inputMode === "email" && email().required, "Email metadata is incomplete");
    assert(authForm().querySelectorAll("input").length === 3 && password().minLength === minimumAuthPasswordLength
      && password().autocomplete === "new-password" && confirmation().autocomplete === "new-password" && password().required && confirmation().required, "Registration fields or constraints changed");
  });
  check("menu shows only the implemented Google provider and omits planned providers", () => {
    const providers = authPanel().querySelectorAll<HTMLButtonElement>(".auth-provider-list button");
    assert(providers.length === 1 && providers[0].disabled === unavailable && /Google/.test(providers[0].textContent ?? ""), "Provider availability is inaccurate");
    assert(!/Apple|Amazon|Coming soon/.test(authPanel().textContent ?? ""), "Planned providers clutter the menu");
  });
  if (unavailable) {
    check("unconfigured auth is factual and fails closed", () => assert(authForm().querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled
      && Boolean(authPanel().querySelector(".auth-unavailable-note[role=status]")), "Missing unavailable state"));
  } else {
    submit(); await assertFieldMessage(email, authPanelCopy("en").emailRequired);
    await assertFieldError(password, "auth.error.password_required");
    await assertFieldMessage(confirmation, authPanelCopy("en").confirmationRequired);
    check("required field errors are associated inline and focus the first invalid input without I/O", () => assert(auth.calls.length === 0
      && document.activeElement === email(), "Blank registration did not focus the required email"));
    await setInput(email(), "not-an-email"); await setInput(password(), "short"); await setInput(confirmation(), "short"); submit();
    await assertFieldError(email, "auth.error.invalid_email");
    check("invalid email validation stops auth I/O", () => assert(auth.calls.length === 0, "Invalid email reached boundary"));
    await setInput(email(), " Fixture@Example.Test "); submit();
    await assertFieldError(password, "auth.error.weak_password");
    check("weak password validation stops auth I/O", () => assert(auth.calls.length === 0, "Weak registration reached boundary"));
    await setInput(password(), "Fixture-password-8"); await setInput(confirmation(), "Other-password-8");
    confirmation().focus(); email().focus();
    await assertFieldError(confirmation, "auth.error.password_mismatch");
    check("confirmation mismatch is reported inline before backend submission", () => assert(auth.calls.length === 0, "Mismatch reached boundary"));
    await setInput(confirmation(), "Fixture-password-8");
    const visibility = authPanel().querySelector<HTMLButtonElement>('button[aria-controls$="-password"]')!;
    visibility.click(); await tick();
    check("password visibility control changes only presentation", () => assert(password().type === "text" && password().value === "Fixture-password-8"
      && visibility.getAttribute("aria-pressed") === "true", "Password visibility changed state"));
    visibility.click(); await tick();
    const confirmationVisibility = authPanel().querySelector<HTMLButtonElement>('button[aria-controls$="-confirmation"]')!;
    confirmationVisibility.click(); await tick();
    check("confirmation visibility has an accessible control and preserves its value", () => assert(confirmation().type === "text"
      && confirmationVisibility.getAttribute("aria-pressed") === "true" && Boolean(confirmationVisibility.getAttribute("aria-label"))
      && confirmation().value === "Fixture-password-8", "Confirmation reveal failed"));
    confirmationVisibility.click(); await tick(); auth.hold = true; submit();
    await waitFor(() => auth.calls.length === 1 && auth.release, "held registration"); submit(); await tick();
    check("pending registration disables fields/buttons and prevents duplicate submissions", () => { assert(auth.calls.length === 1, "Pending auth was duplicated"); assertRequestDisabled("register"); });
    await openSection("household"); await openSection("account");
    check("form values and pending auth survive other accordion interactions", () => assert(password().value === "Fixture-password-8"
      && confirmation().value === "Fixture-password-8" && tab("register").getAttribute("aria-selected") === "true", "Account state remounted"));
    auth.hold = false; auth.release!(); await assertStatus("verification_requested");
    check("registration normalizes email and requests confirmation rather than claiming a session", () => assert(auth.calls[0].kind === "register"
      && auth.calls[0].email === "fixture@example.test" && callbacks.authSuccess === 0, "Registration callback contract changed"));
    check("successful registration clears password fields and retains email", () => assert(password().value === "" && confirmation().value === ""
      && email().value.toLowerCase().trim() === "fixture@example.test", "Sensitive fields not cleared correctly"));
    await openSection("household"); await openSection("account");
    check("registration success state survives collapsing and reopening Account", () => assert(authStatus() === authPanelNoticeContent("verification_requested", "en").body, "Auth status reset by accordion"));
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
    await setInput(password(), "Fixture-password-8"); auth.failNext = true; submit(); await assertStatus("unavailable");
    check("auth boundary failure remains visible without reporting success", () => assert(callbacks.authSuccess === 0 && password().value !== "", "Failure reported success or destroyed retry data"));
    check("auth request errors are directly after the form", () => assert(authForm().nextElementSibling?.classList.contains("report-status"), "Request error is separated from the form"));
    auth.hold = true; auth.release = null; submit();
    await waitFor(() => auth.release && tab("login").disabled, "held login");
    check("login uses a distinct loading action with disabled inputs", () => assertRequestDisabled("login"));
    auth.hold = false; auth.release!(); await assertStatus("signed_in");
    check("successful email login calls parent exactly once and clears password", () => assert(callbacks.authSuccess === 1 && password().value === "", "Login callback changed"));
    await setMode("reset");
    check("reset mode has only the email field", () => assert(authForm().querySelectorAll("input").length === 1, "Reset includes password fields"));
    auth.hold = true; auth.release = null; submit();
    await waitFor(() => auth.release && tab("reset").disabled, "held reset");
    check("reset uses a distinct loading action with disabled email input", () => assertRequestDisabled("reset"));
    auth.hold = false; auth.release!(); await assertStatus("reset_requested");
    check("reset submits the real boundary and does not report authenticated success", () => assert(auth.calls.at(-1)?.kind === "reset"
      && callbacks.authSuccess === 1, "Reset callback contract changed"));
    auth.failNext = true; authPanel().querySelector<HTMLButtonElement>(".auth-google-button")!.click(); await assertStatus("oauth_failure");
    check("Google failure remains actionable without changing auth state", () => assert(auth.calls.at(-1)?.kind === "google" && callbacks.authSuccess === 1, "Google failure changed session"));
    auth.hold = true; auth.release = null;
    authPanel().querySelector<HTMLButtonElement>(".auth-google-button")!.click();
    await waitFor(() => auth.release && authPanel().querySelector(".auth-google-button")?.getAttribute("aria-busy") === "true", "held Google request");
    authPanel().querySelector<HTMLButtonElement>(".auth-google-button")!.click(); await tick();
    check("Google handoff disables auth fields and uses its own single-flight loading action", () => {
      assert(auth.calls.filter(call => call.kind === "google").length === 2, "Google request was duplicated");
      assert(Array.from(authPanel().querySelectorAll<HTMLInputElement>("input")).every(input => input.disabled), "Google left auth inputs editable");
      assert(authPanel().querySelector(".auth-google-button .button-label")?.textContent === authPanelCopy("en").googleLoading, "Google loading copy differs");
      assert(authForm().querySelector('button[type="submit"]')?.getAttribute("aria-busy") !== "true", "Google request incorrectly shows email loading");
    });
    auth.hold = false; auth.release!(); await tick();
    await waitFor(() => auth.calls.filter(call => call.kind === "google").length === 2 && !tab("reset").disabled, "Google boundary completion");
    check("Google uses existing web auth boundary without a synthetic session claim", () => assert(callbacks.authSuccess === 1, "Google stub was presented as live login"));
    await setMode("login"); await setInput(password(), "Fixture-password-8");
  }
  for (const name of sections) {
    await openSection(name);
    check(`${name} opens alone and automatically collapses every other section`, () => {
      assert(header(name).getAttribute("aria-expanded") === "true" && !panel(name).hidden, "Accordion did not open"); assertSingleExpanded();
    });
    check(`${name} has no horizontal overflow at ${innerWidth}px`, () => assertNoOverflow(name));
    header(name).click(); await tick();
    check(`${name} collapses without unmounting its panel`, () => { assert(panel(name).hidden && header(name).getAttribute("aria-expanded") === "false", "Accordion did not close"); assertSingleExpanded(); });
  }
  await openSection("account");
  if (!unavailable) check("selected login mode and typed password survive all six sections", () => assert(tab("login").getAttribute("aria-selected") === "true"
    && password().value === "Fixture-password-8" && email() === retainedEmail, "Account state was lost or remounted"));
  await openSection("household");
  check("household explanation contains Owner/Viewer without fabricated personal data or Editor", () => {
    const text = panel("household").textContent ?? "";
    assert(/Owner/.test(text) && /Viewer/.test(text) && !/Editor|Petzvalova|ghust664|fedorcor28|2\s*\/\s*3/.test(text), "Household contains misleading roles or personal data");
    assert(/active members/i.test(text) && /pending invit/i.test(text) && /3/.test(text), "Occupied-slot explanation missing");
  });
  check("household uses three concise facts, one capacity block and one invite action", () => {
    assert(panel("household").querySelectorAll(".menu-hub-features article").length === 3, "Household fact cards are not compact");
    assert(!panel("household").querySelector(".menu-hub-role-grid,.menu-hub-notice"), "Household repeats explanations in additional blocks");
    assert(panel("household").querySelectorAll("form").length === 1, "Household has competing action areas");
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
  check("three plan cards share a single bounded Premium benefit list without billing documentation", () => {
    assert(panel("subscription").querySelectorAll(".menu-hub-plan").length === 3, "Expected Free, Monthly and Yearly plan overviews");
    const lists = panel("subscription").querySelectorAll("ul");
    assert(lists.length === 1 && lists[0].querySelectorAll("li").length <= 5, "Premium benefits are duplicated or excessive");
    assert(!/Billing & history|Cancelling renewal|original purchasing account/.test(panel("subscription").textContent ?? ""), "Subscription includes extensive signed-in billing detail");
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
    check(`${option.code} updates the hero, section descriptions and selected language immediately`, () => {
      assert(choices[supportedLanguages.findIndex(candidate => candidate.code === option.code)].getAttribute("aria-pressed") === "true", "Selected language inaccurate");
      const translated = loggedOutMenuCopy(option.code);
      assert(document.querySelector(".menu-hub-hero-copy > p:last-child")?.textContent === translated.heroBody, "Hero did not translate");
      assert(header("household").querySelector("small")?.textContent === translated.householdDescription, "Household description did not translate");
      assert(header("subscription").querySelector("small")?.textContent === translated.subscriptionDescription, "Subscription description did not translate");
      assert(localStorage.getItem(onboardingLanguageStorageKey) === option.code && callbacks.languages.at(-1) === option.code, "Language callback contract changed");
      for (const name of sections) assert((header(name).querySelector("small")?.textContent?.length ?? 0) <= 130, `${option.code} ${name} description is too long`);
      const previewTime = panel("language").querySelector<HTMLTimeElement>("time")!;
      assert(previewTime.textContent === new Intl.DateTimeFormat(option.code, { dateStyle: "long" }).format(new Date(previewTime.dateTime)), "Locale date preview differs");
      assertSingleExpanded();
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
  const frame = window.frameElement as HTMLIFrameElement;
  const originalHeight = frame.style.height;
  frame.style.height = "420px"; await tick();
  for (const input of authForm().querySelectorAll<HTMLInputElement>("input")) {
    if (unavailable) {
      input.scrollIntoView({ block: "nearest", behavior: "auto" });
      input.focus(); await tick();
      check(`${input.autocomplete} unavailable input remains disabled and scrollable in the reduced viewport`, () => {
        const bounds = input.getBoundingClientRect();
        assert(input.disabled && document.activeElement !== input, "Unconfigured auth field became editable or focusable");
        assert(bounds.top >= -1 && bounds.bottom <= innerHeight + 1, "Disabled auth field is not scrollable into view");
        assert(!document.querySelector(".app-tab-nav,.mobile-bottom-nav"), "Authenticated sticky controls reappeared");
      });
      continue;
    }
    input.focus(); await tick();
    await waitFor(() => {
      const bounds = input.getBoundingClientRect();
      return document.activeElement === input && bounds.top >= -1 && bounds.bottom <= innerHeight + 1;
    }, `focused ${input.autocomplete} input within the reduced viewport`);
    check(`${input.autocomplete} input remains reachable after a reduced viewport focuses it`, () => {
      const bounds = input.getBoundingClientRect();
      assert(document.activeElement === input && bounds.top >= -1 && bounds.bottom <= innerHeight + 1,
        `Focused auth input is obscured in reduced viewport (${input.autocomplete}; top=${bounds.top}, bottom=${bounds.bottom}, height=${innerHeight}, focused=${document.activeElement === input})`);
      assert(!document.querySelector(".app-tab-nav,.mobile-bottom-nav"), "Authenticated sticky controls reappeared");
    });
  }
  frame.style.height = originalHeight; await tick();
  await openSection("household"); header("household").focus();
  check("hidden mounted Account fields are outside keyboard focus while its header stays usable", () => {
    email().focus();
    assert(document.activeElement === header("household") && email().getClientRects().length === 0, "Collapsed auth fields remained focusable");
  });
  document.querySelector<HTMLButtonElement>(".menu-hub-auth-state")!.click(); await tick();
  check("hero auth action opens only Account and returns focus to its header", () => {
    assert(!panel("account").hidden && document.activeElement === header("account"), "Hero account focus did not return"); assertSingleExpanded();
  });
  await openSection("support");
  check("support exposes only the real in-app destination, without invented contact channels", () => {
    const links = Array.from(panel("support").querySelectorAll<HTMLAnchorElement>("a"));
    assert(links.length > 0 && links.every(link => link.getAttribute("href") === "#/support"), "Unsupported support link");
    assert(!/24\/7|live chat|mailto:|support@plantie/.test(panel("support").innerHTML), "Invented support channel");
    assert(panel("support").querySelectorAll(".menu-hub-help-topics article").length <= 4, "Support is a large help portal");
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
  check("desktop and compact accordions share the same maximum-one-section behavior", assertSingleExpanded);
  const scrolling = document.scrollingElement!; scrolling.scrollTop = scrolling.scrollHeight; await tick();
  check("last expanded legal action is reachable without signed-in bottom navigation", () => {
    const last = Array.from(panel("about").querySelectorAll<HTMLAnchorElement>("a")).at(-1)!;
    assert(last.getBoundingClientRect().bottom <= innerHeight + 1, "Final legal action is not scrollable into view");
    assert(!document.querySelector(".app-tab-nav,.mobile-bottom-nav"), "Logged-out navigation reappeared");
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
