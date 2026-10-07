import { useState } from "react";
import type { ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { KeyRound } from "lucide-react";
import { AuthMessage, AuthPanel } from "../../src/components/AuthPanel";
import { LoggedOutMenu } from "../../src/components/LoggedOutMenu";
import { LoadingButton } from "../../src/components/LoadingButton";
import { useAuth } from "../../src/hooks/useAuth";
import type { AuthState } from "../../src/hooks/useAuth";
import { createNativeAuthLinkSuccessEvent, finishPasswordRecovery, nativeAuthLinkErrorEvent } from "../../src/lib/authService";
import { authPanelCopy, authPanelNoticeContent } from "../../src/lib/authPanelCopy";
import { minimumAuthPasswordLength } from "../../src/lib/authRules";
import { createTranslator } from "../../src/lib/i18n";
import type { AuthMode } from "../../src/lib/authRules";
import { createAuthRedirectUrl, readWebAuthCallback, safeAuthReturnLocation } from "../../src/lib/authRedirects";
import { createNativeAuthCallbackHandler, NativeAuthCallbackError, nativeOAuthSuccessEvent, nativeRecoveryRedirectUrl, parseNativeAuthCallback } from "../../src/lib/nativeOAuth";
import { invitationAuthContextStorageKey, readInvitationAuthContext, rememberInvitationAuthContext } from "../../src/lib/invitationAuthContext";
import { createPasswordRecoveryMarker, passwordRecoveryStorageKey, writePasswordRecoveryMarker } from "../../src/lib/passwordRecoverySession";

type BoundaryError = { code: string; message: string };
type Call = { kind: string; email: string | null; passwordLength: number; redirect: string | null; scope?: string | null };
type Provider = { calls: Call[]; session: AuthState["session"]; holdKind: string | null; release: (() => void) | null;
  errorNext: BoundaryError | null; errorByKind: Record<string, BoundaryError>; signupSession: boolean; events: string[];
  sessionReadError: boolean; emitInitial: boolean; seedSession: () => NonNullable<AuthState["session"]>;
  holdSession: boolean; releaseSession: (() => void) | null;
  emit: (event: string, session?: AuthState["session"]) => void };
const provider = (globalThis as typeof globalThis & { __authFlowFixtureProvider: Provider }).__authFlowFixtureProvider;
const scene = new URLSearchParams(location.search).get("scene") ?? "modes";
const invitationId = "20000000-0000-4000-8000-000000000002";
let currentAuth: AuthState;
let remount: () => void;
const callbacks = { signedIn: 0, updated: 0, noticeConsumed: 0, resetRequested: 0 };
const t = createTranslator("en");
const result = { scene, viewport: { width: innerWidth, height: innerHeight }, checks: [] as string[], failures: [] as string[],
  limitations: ["Real AuthPanel, useAuth, auth service/rules, redirect helpers and production stylesheet. Only Supabase and profile repository boundaries are synthetic.",
    "Provider callbacks and parent recovery/login handoff are controlled fixtures, not a live password update or full App route transition.",
    "No real signup, email, OAuth, native plugins, software keyboard or trusted user input. Native helper parsing/exchange identity is tested without a native store or OS."] };
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const check = (message: string, run: () => void) => { run(); result.checks.push(message); };
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const waitFor = async (condition: () => unknown, label: string) => {
  for (let attempt = 0; attempt < 400; attempt += 1) { if (condition()) return; await tick(); }
  throw new Error(`Timed out waiting for ${label}`);
};
const panel = () => document.querySelector<HTMLElement>(".auth-panel,.auth-recovery-card")!;
const form = () => panel().querySelector<HTMLFormElement>("form")!;
const email = () => panel().querySelector<HTMLInputElement>('input[autocomplete="email"]')!;
const password = () => panel().querySelector<HTMLInputElement>('input[id$="-password"]')!;
const confirmation = () => panel().querySelector<HTMLInputElement>('input[id$="-confirmation"]')!;
const status = () => panel().querySelector<HTMLElement>(".report-status")!;
const submit = () => form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
const tab = (mode: "register" | "login" | "reset") => panel().querySelector<HTMLButtonElement>(`[role=tab][id$="-${mode}"]`)!;
const mode = () => panel().querySelector<HTMLElement>('[role=tab][aria-selected="true"]')?.id.split("-").slice(-1)[0];
const calls = (kind: string) => provider.calls.filter(call => call.kind === kind);
const setInput = async (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true })); await tick();
};
const selectMode = async (next: "register" | "login" | "reset") => {
  tab(next).click(); await waitFor(() => mode() === next, `mode ${next}`);
};
const validPasswords = async () => {
  await setInput(password(), "synthetic-test-password");
  if (confirmation()) await setInput(confirmation(), "synthetic-test-password");
};
const assertFieldError = (field: HTMLInputElement) => {
  assert(field.getAttribute("aria-invalid") === "true", "Invalid field needs aria-invalid");
  assert((field.getAttribute("aria-describedby") ?? "").split(/\s+/).some(id => document.getElementById(id)?.classList.contains("auth-field-error")), "Inline error must be associated with its field");
};
const assertNoOverflow = () => {
  const scrolling = document.scrollingElement!;
  assert(scrolling.scrollWidth <= scrolling.clientWidth + 1, "Auth flow causes horizontal document overflow");
  for (const element of panel().querySelectorAll<HTMLElement>("input,button")) {
    if (!element.getClientRects().length) continue;
    const bounds = element.getBoundingClientRect();
    assert(bounds.left >= -1 && bounds.right <= innerWidth + 1, "Auth control escapes CSS viewport");
  }
};

const Fixture = () => {
  const auth = useAuth(); currentAuth = auth;
  const [mount, setMount] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [exitFailed, setExitFailed] = useState(false);
  const [handoff, setHandoff] = useState<{ mode: AuthMode; email: string; notice: ComponentProps<typeof AuthPanel>["initialNotice"] } | null>(null);
  remount = () => setMount(value => value + 1);
  const requestNewLink = async (address = auth.user?.email ?? "") => {
    const flowId = auth.recoveryFlowId;
    callbacks.resetRequested += 1; setLeaving(true); setExitFailed(false);
    try { await finishPasswordRecovery(); if (!auth.completePasswordRecovery(flowId)) return; setHandoff({ mode: "reset", email: address || auth.user?.email || "", notice: undefined }); }
    catch { if (auth.isPasswordRecoveryFlowCurrent(flowId)) setExitFailed(true); }
    finally { setLeaving(false); }
  };
  if (auth.loading) return <main className="app-shell access-shell"><p role="status">Loading synthetic auth session</p></main>;
  if (auth.invalidRecoveryLink) return <main className="app-shell access-shell onboarding-shell" data-screen="invalid-recovery">
    <section className="access-card onboarding-card auth-recovery-card"><h1>{authPanelNoticeContent("invalid_link", "en").title}</h1>
      <AuthMessage severity="warning">{authPanelNoticeContent("invalid_link", "en").body}</AuthMessage>
      {exitFailed ? <AuthMessage severity="error">{authPanelNoticeContent("recovery_cleanup_failed", "en").body}</AuthMessage> : null}
      <LoadingButton className="primary-action" type="button" isLoading={leaving} loadingLabel="Loading" onClick={() => { void requestNewLink(); }}>{authPanelCopy("en").requestNewReset}</LoadingButton>
    </section>
  </main>;
  if (auth.callbackError) return <main className="app-shell access-shell onboarding-shell" data-screen="callback-error"><section className="access-card onboarding-card">
    <h1>Invalid authentication callback</h1><button type="button" className="neutral-action" onClick={auth.dismissCallbackError}>Return to sign in</button>
    <AuthPanel compact initialMode="login" language="en" onSuccess={auth.dismissCallbackError} />
  </section></main>;
  if (auth.isPasswordRecovery) return <main className="app-shell access-shell onboarding-shell" data-screen="recovery">
    <section className="access-card onboarding-card auth-recovery-card" aria-labelledby="fixture-recovery-title"><div className="section-title"><KeyRound size={22} aria-hidden="true" /><h1 id="fixture-recovery-title">{t("auth.newPasswordTitle")}</h1></div>
      <p>{t("auth.newPasswordBody")}</p><AuthPanel key={auth.recoveryFlowId} compact initialMode="updatePassword" language="en"
      onRequestPasswordReset={requestNewLink} onPasswordUpdated={async address => {
        callbacks.updated += 1; const flowId = auth.beginPasswordRecoveryCompletion(auth.recoveryFlowId); if (flowId === null) return;
        await finishPasswordRecovery(); if (!auth.completePasswordRecovery(flowId)) return;
        setHandoff({ mode: "login", email: address ?? "", notice: { key: "password_changed", severity: "success" } });
      }} /></section>
  </main>;
  if (scene === "invitation") return <main className="app-shell access-shell onboarding-shell" data-screen="invitation"><section className="access-card onboarding-card">
    <AuthPanel key={mount} compact language="en" initialEmail=" Recipient@Example.invalid " invitationId={invitationId}
      onNoticeConsumed={() => { callbacks.noticeConsumed += 1; setHandoff(value => value ? { ...value, notice: undefined } : null); }}
      onSuccess={() => { callbacks.signedIn += 1; }} />
  </section></main>;
  return <LoggedOutMenu key={mount} language="en" onLanguageChange={() => undefined} inviteInput="" onInviteInputChange={() => undefined}
    onContinueInvite={() => undefined} isJoiningInvite={false} inviteStatus="" inviteStatusClass="report-status"
    initialAuthMode={handoff?.mode} initialAuthEmail={handoff?.email} initialAuthNotice={handoff?.notice}
    onAuthNoticeConsumed={() => { callbacks.noticeConsumed += 1; setHandoff(value => value ? { ...value, notice: undefined } : null); }}
    onAuthSuccess={() => { callbacks.signedIn += 1; }} />;
};

const StandaloneFixture = () => <main className="app-shell access-shell onboarding-shell"><section className="access-card onboarding-card">
  <h1>Set new password</h1><AuthPanel compact initialMode="updatePassword" language="en" onSuccess={() => { callbacks.signedIn += 1; }} />
</section></main>;

const assertHelpers = async () => {
  check("OAuth redirect returns to its localhost origin", () => assert(createAuthRedirectUrl("http://localhost:5173/#/menu") === "http://localhost:5173/auth/callback", "Local origin changed"));
  check("Recovery redirect returns to its production origin", () => assert(createAuthRedirectUrl("https://plantie.example/#/join", "recovery") === "https://plantie.example/auth/recovery", "Production origin changed"));
  check("Credential-bearing redirect origin is rejected", () => assert(!createAuthRedirectUrl("https://user@plantie.example/#/menu"), "Credentials accepted"));
  check("External stored return location is rejected", () => assert(safeAuthReturnLocation("//attacker.invalid/#/menu") === "/#/menu", "Open redirect allowed"));
  check("Duplicate web recovery codes fail closed", () => assert(readWebAuthCallback("https://plantie.example/auth/recovery?code=one&code=two")?.error, "Duplicate code accepted"));
  check("Implicit tokens do not bypass PKCE callback validation", () => assert(readWebAuthCallback("https://plantie.example/auth/recovery#access_token=synthetic&type=recovery")?.error, "Implicit token accepted"));
  check("Native recovery has the exact app scheme/host/path", () => assert(parseNativeAuthCallback(`${nativeRecoveryRedirectUrl}?code=synthetic-native-code`)?.kind === "recovery", "Native recovery kind lost"));
  check("Native foreign origin cannot exchange a code", () => assert(parseNativeAuthCallback("com.plantie.app://foreign/recovery?code=synthetic") === null, "Foreign native host accepted"));
  let invalid = false;
  try { parseNativeAuthCallback(`${nativeRecoveryRedirectUrl}?code=synthetic&type=signup`); } catch (error) { invalid = error instanceof NativeAuthCallbackError; }
  check("Native recovery rejects confirmation type confusion", () => assert(invalid, "Conflicting native kind accepted"));
  let exchanges = 0;
  const callback = createNativeAuthCallbackHandler(async () => { exchanges += 1; await tick(); return { error: null }; });
  const url = `${nativeRecoveryRedirectUrl}?code=synthetic-once`;
  const responses = await Promise.all([callback(url), callback(url)]);
  check("Concurrent native delivery exchanges once", () => assert(exchanges === 1 && responses.some(value => value?.status === "duplicate"), "Duplicate native exchange"));
  const repeated = await callback(url);
  check("Repeated completed native callback stays idempotent", () => assert(repeated?.status === "duplicate" && exchanges === 1, "Completed callback exchanged again"));
};

const exerciseModes = async () => {
  check("Create defaults to three correctly labeled fields", () => {
    assert(mode() === "register" && form().querySelectorAll("input").length === 3, "Create fields wrong");
    for (const input of form().querySelectorAll<HTMLInputElement>("input")) assert(panel().querySelector(`label[for="${input.id}"]`), "Missing input label");
    assert(password().minLength === minimumAuthPasswordLength && confirmation().autocomplete === "new-password", "Password policy/autocomplete wrong");
  });
  submit(); await tick();
  check("Invalid empty form blocks provider I/O and focuses email", () => { assert(provider.calls.length === 0, "Invalid form performed I/O"); assertFieldError(email()); assert(document.activeElement === email(), "Invalid email not focused"); });
  await setInput(email(), " Mixed@Example.invalid "); await validPasswords();
  await selectMode("login");
  check("Manual Create to Sign in preserves normalized email and clears passwords", () => { assert(email().value === "mixed@example.invalid" && password().value === "" && !confirmation(), "Sensitive/manual state not cleared"); });
  await setInput(password(), "synthetic-test-password"); await selectMode("register");
  check("Manual Sign in to Create clears both password fields and old errors", () => assert(email().value === "mixed@example.invalid" && password().value === "" && confirmation().value === "" && !status(), "Manual switch retained state"));
  await validPasswords(); provider.errorNext = { code: "user_already_exists", message: "Synthetic private provider detail" }; submit();
  await waitFor(() => mode() === "login" && Boolean(status()), "authoritative existing account transition");
  check("Explicit existing account transitions to Sign in safely", () => { assert(email().value === "mixed@example.invalid" && password().value === "", "Email/password transition wrong"); assert(status().classList.contains("auth-message-info") && status().getAttribute("role") === "status", "Existing account info semantics wrong"); assert(document.activeElement === password(), "Transition did not focus password"); });
  await setInput(password(), "synthetic-test-password"); provider.errorNext = { code: "invalid_credentials", message: "Synthetic provider SQL 123-private" }; submit();
  await waitFor(() => Boolean(status()?.classList.contains("auth-message-error")), "generic credentials error");
  check("Generic invalid credentials remain Sign in without claiming account absence", () => { assert(mode() === "login" && !status().textContent?.includes("No account"), "Generic error enumerates account"); assert(!status().textContent?.includes("123-private") && status().getAttribute("role") === "alert", "Raw details or error semantics wrong"); });
  provider.errorNext = { code: "user_not_found", message: "Synthetic authoritative absent result" }; submit();
  await waitFor(() => mode() === "register", "authoritative absent account transition");
  check("Explicit provider absence guides Create without creating an account", () => { assert(email().value === "mixed@example.invalid" && password().value === "" && confirmation().value === "", "Automatic transition retained secrets"); assert(calls("register").length === 1 && status().classList.contains("auth-message-info"), "Transition submitted registration automatically"); });
  await validPasswords(); submit(); await waitFor(() => Boolean(status()?.classList.contains("auth-message-success")), "verification-required signup");
  check("No-session signup remains Create with non-disclosing email guidance", () => { assert(mode() === "register" && !currentAuth.isAuthenticated && callbacks.signedIn === 0, "Signup pretended to authenticate"); assert(password().value === "" && confirmation().value === "", "Signup retained passwords"); });
  await selectMode("reset");
  check("Request reset has email only and preserves it", () => assert(form().querySelectorAll("input").length === 1 && email().value === "mixed@example.invalid" && !status(), "Reset fields or message wrong"));
  provider.holdKind = "reset"; submit(); submit(); await waitFor(() => calls("reset").length === 1, "reset request");
  check("Pending reset disables inputs and duplicate requests", () => { assert(email().disabled && form().querySelector<HTMLButtonElement>('button[type=submit]')!.disabled, "Pending reset fields enabled"); assert(calls("reset")[0].redirect === `${location.origin}/auth/recovery`, "Reset origin incorrect"); });
  window.dispatchEvent(new Event(nativeOAuthSuccessEvent)); await tick();
  check("Unrelated native OAuth events cannot complete a pending email request", () => assert(callbacks.signedIn === 0 && email().disabled && calls("reset").length === 1, "Native event bypassed pending reset"));
  provider.release!(); await waitFor(() => Boolean(status()?.classList.contains("auth-message-success")), "reset requested");
  const resetCount = calls("reset").length; submit(); await tick();
  check("Reset cooldown prevents repeat provider requests", () => { assert(calls("reset").length === resetCount && form().querySelector<HTMLButtonElement>('button[type=submit]')!.disabled, "Cooldown bypassed"); });
  await selectMode("login"); await setInput(password(), "synthetic-test-password");
  provider.errorNext = { code: "unexpected_private", message: "SQL_AUTH_PRIVATE" }; submit(); await waitFor(() => Boolean(status()?.classList.contains("auth-message-error")), "unknown provider error");
  check("Unknown provider errors use safe generic guidance", () => assert(mode() === "login" && !status().textContent?.includes("SQL_AUTH_PRIVATE"), "Unknown error leaked or routed account"));
  const google = panel().querySelector<HTMLButtonElement>(".auth-google-button")!;
  provider.errorNext = { code: "user_not_found", message: "Synthetic Google identity response" }; google.click();
  await tick();
  await waitFor(() => calls("google").length === 1 && !google.disabled && status()?.classList.contains("auth-message-error"), "Google error");
  check("Google never borrows password account-existence routing", () => assert(mode() === "login" && !status().textContent?.includes("No account"), "Google fabricated password absence"));
  check("Google web redirect and stored return stay at initiating origin", () => assert(calls("google")[0].redirect === `${location.origin}/auth/callback` && Boolean(sessionStorage.getItem("plantie.auth.return-path")), "Google origin/context lost"));
  await validPasswords(); submit(); await waitFor(() => callbacks.signedIn === 1, "successful login");
  check("Confirmed login clears sensitive form state", () => assert(password().value === "" && calls("login").slice(-1)[0]?.email === "mixed@example.invalid", "Login retained secret or unnormalized email"));
};

const exerciseInvitation = async () => {
  check("Invitation recipient email is normalized and read-only", () => assert(email().value === "recipient@example.invalid" && email().readOnly, "Recipient editing allowed"));
  check("Invitation context is stored without an invite token", () => assert(readInvitationAuthContext(localStorage) === invitationId && !localStorage.getItem(invitationAuthContextStorageKey)?.includes("password"), "Invite context lost"));
  await validPasswords(); provider.errorNext = { code: "user_already_exists", message: "Synthetic known account" }; submit(); await waitFor(() => mode() === "login", "invitation automatic login");
  check("Invitation mode transition preserves recipient and clears password", () => assert(email().readOnly && email().value === "recipient@example.invalid" && password().value === "", "Invite transition changed recipient"));
  await setInput(password(), "synthetic-test-password"); provider.errorNext = { code: "invalid_credentials", message: "Synthetic wrong credentials" }; submit(); await waitFor(() => Boolean(status()?.classList.contains("auth-message-error")), "invitation generic failure");
  check("Invitation generic credentials do not change account mode or recipient", () => assert(mode() === "login" && email().readOnly && readInvitationAuthContext(localStorage) === invitationId, "Invite generic error changed context"));
  await selectMode("reset");
  check("Invitation reset still uses fixed email-only form", () => assert(email().readOnly && form().querySelectorAll("input").length === 1, "Invite reset exposes extra fields"));
  await selectMode("register");
  const google = panel().querySelector<HTMLButtonElement>(".auth-google-button")!; google.click(); await waitFor(() => calls("google").length === 1 && !google.disabled, "invite Google boundary");
  check("Google redirect contains recipient-resolvable invitation ID only", () => { const redirect = new URL(calls("google")[0].redirect!); assert(redirect.origin === location.origin && redirect.searchParams.get("invitation") === invitationId && !redirect.searchParams.has("invite"), "Google lost invite or exposed raw token"); });
};

const exerciseRecovery = async () => {
  if (scene === "recovery-invalid" || scene === "recovery-restoration-failure") {
    await waitFor(() => currentAuth.invalidRecoveryLink, "invalid recovery hook state");
    check("Expired/reused provider code cannot open a usable password form", () => assert(!form() && !password() && !currentAuth.isAuthenticated && calls("update").length === 0, "Invalid callback usable"));
    check("Recovery failure is distinct from generic OAuth callback failure", () => assert(!currentAuth.callbackError
      && calls("exchange").length === (scene === "recovery-invalid" ? 1 : 0), "Recovery kind lost"));
    if (scene === "recovery-restoration-failure") check("Cached INITIAL_SESSION plus read failure cannot authenticate or open recovery fields", () => assert(!currentAuth.isAuthenticated && !currentAuth.isPasswordRecovery && !form(), "Read failure escaped recovery gate"));
    const action = panel().querySelector<HTMLButtonElement>("button.primary-action")!;
    check("Invalid recovery exposes a request-new-link action", () => assert(action && !action.disabled, "Missing recovery action"));
    if (scene === "recovery-restoration-failure") {
      action.click(); await waitFor(() => panel().querySelector(".auth-message-error"), "failed invalid-session cleanup");
      check("Failed new-link cleanup retains invalid recovery without password fields", () => assert(currentAuth.invalidRecoveryLink && !form() && !password(), "Failed new-link cleanup reopened update form"));
      provider.sessionReadError = false;
    }
    action.click(); await waitFor(() => mode() === "reset", "invalid recovery request new link");
    check("Request-new-link exits invalid state to email-only reset", () => assert(!currentAuth.invalidRecoveryLink && form().querySelectorAll("input").length === 1
      && callbacks.resetRequested === (scene === "recovery-restoration-failure" ? 2 : 1), "Invalid state not cleared safely"));
    return;
  }
  await waitFor(() => currentAuth.isPasswordRecovery && Boolean(password()), "verified recovery form");
  check("Validated recovery session gates the real two-field update form", () => assert(!email() && form().querySelectorAll("input").length === 2 && !currentAuth.isAuthenticated, "Recovery bypassed normal authentication gate"));
  check("Recovery fields use new-password and accessible reveal controls", () => { assert(password().autocomplete === "new-password" && confirmation().autocomplete === "new-password", "Recovery autocomplete wrong"); assert(panel().querySelectorAll(".auth-password-toggle").length === 2, "Missing recovery reveal controls"); });
  check("Callback credentials are removed from browser location", () => assert(!location.search.includes("code=") && !location.hash.includes("access_token"), "Credentials retained in location"));
  check("Recovery persistence marker contains no credential", () => { const marker = sessionStorage.getItem(passwordRecoveryStorageKey); assert(marker && !marker.includes("token") && !marker.includes("password"), "Marker contains credential"); });
  check("Recovery callback preserves a separate pending invitation context", () => assert(readInvitationAuthContext(localStorage) === invitationId
    && sessionStorage.getItem("plantie.auth.return-invitation") === invitationId, "Recovery consumed invitation return context"));
  if (scene === "recovery-form-preview") return;
  if (scene === "recovery-expired") {
    provider.session = null; window.dispatchEvent(new Event("focus")); await waitFor(() => currentAuth.invalidRecoveryLink, "session expiration on focus");
    check("Lost recovery session removes update fields immediately", () => assert(!password() && !form() && !currentAuth.isPasswordRecovery && !currentAuth.isAuthenticated, "Expired session retains form"));
    check("Expired recovery offers reset without an update request", () => assert(panel().querySelector("button.primary-action") && calls("update").length === 0, "Expired recovery lacks action"));
    return;
  }
  await setInput(password(), "synthetic-test-password"); await setInput(confirmation(), "synthetic-mismatch"); submit(); await tick();
  check("Recovery mismatch blocks backend update and associates inline error", () => { assert(calls("update").length === 0, "Mismatch updated provider"); assertFieldError(confirmation()); });
  await setInput(confirmation(), "synthetic-test-password");
  if (scene === "recovery-failure") provider.errorNext = { code: "request_timeout", message: "PRIVATE_PROVIDER_UPDATE_DETAIL" };
  if (scene === "recovery-cleanup-failure") provider.errorByKind.signout = { code: "network_error", message: "PRIVATE_PROVIDER_CLEANUP_DETAIL" };
  provider.holdKind = "update"; submit(); submit(); await waitFor(() => calls("update").length === 1, "held password update");
  check("Pending password update disables both inputs and blocks duplicates", () => assert(password().disabled && confirmation().disabled && form().querySelector<HTMLButtonElement>('button[type=submit]')!.disabled && calls("update").length === 1, "Duplicate update or enabled field"));
  const releaseUpdate = provider.release!;
  if (scene === "recovery-success" || scene === "recovery-handoff-preview") provider.holdKind = "signout";
  releaseUpdate();
  if (scene === "recovery-failure") {
    await waitFor(() => Boolean(status()?.classList.contains("auth-message-error")), "failed password update message");
    check("Failed provider update remains in recovery with usable retry form", () => assert(currentAuth.isPasswordRecovery && Boolean(form()) && !password().disabled && callbacks.updated === 0 && calls("signout").length === 0, "Failure escaped recovery"));
    check("Update failure never exposes provider details", () => assert(status().getAttribute("role") === "alert" && !status().textContent?.includes("PRIVATE_PROVIDER_UPDATE_DETAIL"), "Unsafe update error"));
    return;
  }
  if (scene === "recovery-cleanup-failure") {
    await waitFor(() => Boolean(panel().querySelector(".auth-recovery-finish")), "failed recovery cleanup retry");
    check("Changed password with failed cleanup hides update form and retains recovery gate", () => assert(currentAuth.isPasswordRecovery && !form() && !password() && !currentAuth.isAuthenticated, "Cleanup failure permits another update or app access"));
    const finish = panel().querySelector<HTMLButtonElement>(".auth-recovery-finish")!; finish.click();
    await waitFor(() => mode() === "login", "cleanup retry login handoff");
    check("Cleanup retry never updates the password a second time", () => assert(calls("update").length === 1 && calls("signout").length === 2 && callbacks.updated === 2, "Cleanup retry duplicated password update"));
  } else {
    await waitFor(() => calls("signout").length === 1 && Boolean(provider.release), "signout after user updated");
    check("USER_UPDATED cannot release recovery before verified cleanup", () => assert(provider.events.includes("USER_UPDATED") && currentAuth.isPasswordRecovery && !currentAuth.isAuthenticated, "User updated escaped recovery"));
    provider.release!(); await waitFor(() => mode() === "login", "completed recovery login handoff");
  }
  check("Successful recovery cleanup selects Sign in and clears provider session", () => assert(!currentAuth.isPasswordRecovery && !currentAuth.isAuthenticated && provider.session === null && password().value === "" && !confirmation(), "Recovery success retained gate/session/password"));
  check("Recovery success pre-fills safe email and one-time announced notice", () => assert(email().value === "fixture@example.invalid" && status().classList.contains("auth-message-success") && status().getAttribute("role") === "status" && callbacks.noticeConsumed === 1, "Login notice/email wrong"));
  check("Cleanup signs out locally and clears credential-free recovery marker", () => assert(calls("signout").slice(-1)[0]?.scope === "local" && sessionStorage.getItem(passwordRecoveryStorageKey) === null, "Recovery cleanup incomplete"));
  if (scene === "recovery-handoff-preview") return;
  await selectMode("register");
  check("Manual interaction consumes old recovery success notice", () => assert(!status() && password().value === "" && confirmation().value === "", "Old recovery notice persisted"));
  remount(); await tick();
  check("One-time recovery notice does not reappear on a new auth panel", () => assert(!status(), "Consumed notice replayed"));
};

const exerciseMarker = async () => {
  if (scene === "marker-valid") {
    check("Same-user unexpired marker restores verified recovery after reload", () => assert(currentAuth.isPasswordRecovery && !currentAuth.isAuthenticated && Boolean(password()) && !email(), "Valid recovery reload lost gate"));
    check("Valid marker reload neither exchanges nor updates a credential", () => assert(calls("exchange").length === 0 && calls("update").length === 0, "Marker restoration mutated auth"));
  } else if (scene === "marker-expired" || scene === "marker-mismatched") {
    check("Expired or other-user marker fails closed without password fields", () => assert(currentAuth.invalidRecoveryLink && !currentAuth.isAuthenticated && !form() && !password(), "Invalid marker granted recovery"));
    check("Invalid marker offers a fresh-link action without provider update", () => assert(panel().querySelector("button.primary-action") && calls("update").length === 0, "Invalid marker lacks safe exit"));
  } else if (scene === "marker-malformed") {
    check("Malformed marker never grants a password-recovery state", () => assert(!currentAuth.isPasswordRecovery && Boolean(tab("register")), "Malformed marker granted recovery"));
    check("Malformed marker causes no callback exchange or password update", () => assert(calls("exchange").length === 0 && calls("update").length === 0, "Malformed marker mutated auth"));
  } else if (scene === "marker-normal-callback") {
    check("Successful normal callback clears an unrelated recovery marker", () => assert(currentAuth.isAuthenticated && !currentAuth.isPasswordRecovery && !currentAuth.invalidRecoveryLink
      && sessionStorage.getItem(passwordRecoveryStorageKey) === null, "Normal callback retained stale recovery"));
    check("Normal callback keeps provider event type and strips exchanged code", () => assert(provider.events.includes("SIGNED_IN") && !provider.events.includes("PASSWORD_RECOVERY") && calls("exchange").length === 1 && !location.search.includes("code="), "Normal callback misclassified or code retained"));
  } else {
    check("Failed normal callback cannot release cached verified recovery", () => assert(currentAuth.callbackError && currentAuth.isPasswordRecovery && !currentAuth.isAuthenticated
      && sessionStorage.getItem(passwordRecoveryStorageKey), "Failed normal callback released recovery"));
    currentAuth.dismissCallbackError(); await waitFor(() => !currentAuth.callbackError && Boolean(password()), "dismiss failed normal callback");
    check("Dismissing failed callback retains recovery rather than authenticating", () => assert(currentAuth.isPasswordRecovery && !currentAuth.isAuthenticated && !email(), "Error dismissal auto-authenticated recovery"));
    window.dispatchEvent(new CustomEvent(nativeAuthLinkErrorEvent, { detail: { kind: "oauth" } }));
    await waitFor(() => currentAuth.callbackError, "normal callback error before new recovery");
    provider.emit("PASSWORD_RECOVERY", provider.seedSession());
    await waitFor(() => currentAuth.isPasswordRecovery && !currentAuth.callbackError && Boolean(password()), "new recovery replaces normal error");
    check("New validated recovery clears an obsolete normal callback error", () => assert(!currentAuth.isAuthenticated && Boolean(form()) && !email(), "New recovery remained blocked by old normal error"));
  }
};

const expiryTimers: Array<{ id: number; delay: number; callback: () => void; cancelled: boolean }> = [];
let clockNow = Date.now();
const originalNow = Date.now;
const originalSetTimeout = window.setTimeout.bind(window);
const originalClearTimeout = window.clearTimeout.bind(window);
if (scene === "recovery-marker-timers") {
  // Only recovery expiry deadlines are scheduled through this deterministic
  // boundary. Zero-delay rendering/test work retains the real event loop.
  Date.now = () => clockNow;
  window.setTimeout = ((callback: TimerHandler, delay = 0, ...args: unknown[]) => {
    if (delay < 30_000 || typeof callback !== "function") return originalSetTimeout(callback, delay, ...args);
    const id = -1000 - expiryTimers.length;
    expiryTimers.push({ id, delay, callback: () => callback(...args), cancelled: false }); return id;
  }) as typeof window.setTimeout;
  window.clearTimeout = ((id: number | undefined) => {
    const timer = expiryTimers.find(value => value.id === id);
    if (timer) timer.cancelled = true; else originalClearTimeout(id);
  }) as typeof window.clearTimeout;
}
const exerciseExpiryTimers = async () => {
  const source = provider.seedSession();
  const first = { ...source, expires_at: Math.floor(clockNow / 1000) + 60 };
  provider.emit("PASSWORD_RECOVERY", first);
  await waitFor(() => currentAuth.isPasswordRecovery && expiryTimers.length === 1, "first recovery expiry scheduler");
  check("Verified recovery schedules its original session deadline", () => assert(expiryTimers[0].delay > 59_000 && expiryTimers[0].delay <= 60_000, "Expiry scheduler deadline wrong"));
  provider.emit("TOKEN_REFRESHED", { ...first, expires_at: first.expires_at + 3600 }); await tick();
  check("Session refresh cannot extend original recovery deadline", () => assert(expiryTimers.length === 1 && JSON.parse(sessionStorage.getItem(passwordRecoveryStorageKey)!).expiresAt === first.expires_at * 1000, "Refresh extended recovery"));
  const second = { ...source, expires_at: Math.floor(clockNow / 1000) + 120 };
  provider.emit("PASSWORD_RECOVERY", second);
  await waitFor(() => expiryTimers.length === 2, "renewed recovery deadline");
  check("New verified recovery replaces its previous deadline", () => assert(expiryTimers[0].cancelled && expiryTimers[1].delay > 119_000 && JSON.parse(sessionStorage.getItem(passwordRecoveryStorageKey)!).expiresAt === second.expires_at * 1000, "New marker failed to reschedule"));
  clockNow = first.expires_at * 1000 + 1; expiryTimers[0].callback(); await tick();
  check("Already queued old timeout cannot expire a newer verified recovery", () => assert(currentAuth.isPasswordRecovery && !currentAuth.invalidRecoveryLink, "Stale timeout expired new marker"));
  clockNow = second.expires_at * 1000 + 1; expiryTimers[1].callback();
  await waitFor(() => currentAuth.invalidRecoveryLink, "new marker due deadline");
  check("Current recovery deadline expires without usable update fields", () => assert(!currentAuth.isPasswordRecovery && !currentAuth.isAuthenticated && !form() && !password(), "Current expiry did not fail closed"));
};

const exerciseRecoveryGeneration = async () => {
  const before = currentAuth.recoveryFlowId;
  const first = provider.seedSession(); provider.emit("PASSWORD_RECOVERY", first);
  await waitFor(() => currentAuth.isPasswordRecovery && currentAuth.recoveryFlowId !== before && Boolean(password()), "generation first flow");
  const oldId = currentAuth.recoveryFlowId; await validPasswords();
  check("Current recovery can begin finishing against its exact flow ID", () => assert(currentAuth.beginPasswordRecoveryCompletion(oldId) === oldId, "Current completion rejected"));
  await tick();
  const second = { ...first, expires_at: first.expires_at! + 60 }; provider.emit("PASSWORD_RECOVERY", second);
  await waitFor(() => currentAuth.recoveryFlowId !== oldId && Boolean(password()) && password().value === "", "new flow while old cleanup awaited");
  check("New recovery mounts clean password fields while old completion is pending", () => assert(currentAuth.isPasswordRecovery && !currentAuth.isAuthenticated && confirmation().value === "", "New flow retained old password state"));
  check("Late old completion cannot clear a newer recovery/session", () => assert(currentAuth.completePasswordRecovery(oldId) === false
    && currentAuth.user?.id === second.user.id && provider.session?.expires_at === second.expires_at, "Old completion released new flow"));
  check("Old update result cannot start cleanup for a newer flow", () => assert(currentAuth.beginPasswordRecoveryCompletion(oldId) === null && calls("signout").length === 0, "Stale update began cleanup"));
  check("New flow remains gated with its own marker after stale completions", () => assert(currentAuth.isPasswordRecovery && !currentAuth.isAuthenticated
    && JSON.parse(sessionStorage.getItem(passwordRecoveryStorageKey)!).expiresAt === second.expires_at! * 1000, "New flow marker lost"));
};

const exerciseNativeEvents = async () => {
  window.dispatchEvent(new Event(nativeOAuthSuccessEvent)); await tick();
  check("Unsolicited native OAuth success cannot complete a normal auth panel", () => assert(callbacks.signedIn === 0 && !currentAuth.isAuthenticated, "Unsolicited OAuth completed auth"));
  const session = provider.seedSession(); provider.emit("PASSWORD_RECOVERY", session);
  await waitFor(() => currentAuth.isPasswordRecovery, "native verified recovery event");
  window.dispatchEvent(new Event(nativeOAuthSuccessEvent)); await tick();
  check("Native Google success does not bypass password recovery", () => assert(currentAuth.isPasswordRecovery && !currentAuth.isAuthenticated && callbacks.signedIn === 0, "Google success escaped recovery"));
  provider.emit("SIGNED_IN", session); await tick();
  check("Provider SIGNED_IN alone cannot clear a pending recovery marker", () => assert(currentAuth.isPasswordRecovery && !currentAuth.isAuthenticated, "Unclassified sign-in cleared recovery"));
  window.dispatchEvent(createNativeAuthLinkSuccessEvent({ kind: "oauth", status: "completed" })!);
  await waitFor(() => currentAuth.isAuthenticated && !currentAuth.isPasswordRecovery, "trusted native OAuth kind");
  check("Verified normal native callback clears stale recovery and retains provider session", () => assert(sessionStorage.getItem(passwordRecoveryStorageKey) === null && currentAuth.user?.id === session.user.id, "Trusted normal callback retained marker or lost session"));
  window.dispatchEvent(createNativeAuthLinkSuccessEvent({ kind: "recovery", status: "completed" })!);
  await waitFor(() => currentAuth.invalidRecoveryLink, "native recovery missing verified event");
  check("Native recovery success without PASSWORD_RECOVERY cannot mount update fields", () => assert(!password() && !form() && !currentAuth.isAuthenticated, "Native recovery bypassed verifier event"));
  provider.emit("PASSWORD_RECOVERY", session); await waitFor(() => currentAuth.isPasswordRecovery, "native recovery reverified");
  window.dispatchEvent(new CustomEvent(nativeAuthLinkErrorEvent, { detail: { kind: "recovery" } }));
  await waitFor(() => currentAuth.invalidRecoveryLink, "native recovery error kind");
  check("Native recovery error keeps its purpose and blocks usable password fields", () => assert(!currentAuth.callbackError && !password() && !form(), "Native recovery error became generic or usable"));
};

const exerciseStandalone = async () => {
  check("Standalone recovery begins with password fields and no email", () => assert(!email() && form().querySelectorAll("input").length === 2, "Standalone fields wrong"));
  await validPasswords();
  if (scene === "standalone-cleanup-failure") provider.errorByKind.signout = { code: "network_error", message: "PRIVATE_STANDALONE_CLEANUP" };
  submit();
  if (scene === "standalone-cleanup-failure") {
    await waitFor(() => Boolean(panel().querySelector(".auth-recovery-finish")), "standalone cleanup retry");
    check("Standalone failed cleanup suppresses another password update", () => assert(!form() && !password() && calls("update").length === 1 && !status().textContent?.includes("PRIVATE_STANDALONE_CLEANUP"), "Standalone cleanup leaked or permits update"));
    panel().querySelector<HTMLButtonElement>(".auth-recovery-finish")!.click();
  }
  await waitFor(() => mode() === "login", "standalone verified cleanup login");
  check("Standalone recovery closes the real service session before Sign in", () => assert(provider.session === null && calls("signout").length >= 1 && calls("signout").slice(-1)[0].scope === "local", "Standalone session not closed"));
  check("Standalone completion never invokes normal signed-in callback", () => assert(callbacks.signedIn === 0 && calls("update").length === 1, "Standalone completion authenticated or updated twice"));
  check("Standalone completion clears fields and safely prefills email", () => assert(password().value === "" && !confirmation() && email().value === "fixture@example.invalid", "Standalone sensitive state not cleared"));
  check("Standalone password change is announced as success", () => assert(status().classList.contains("auth-message-success") && status().getAttribute("role") === "status", "Standalone success notice missing"));
};

if (scene.startsWith("recovery-")) {
  rememberInvitationAuthContext(invitationId, localStorage);
  sessionStorage.setItem("plantie.auth.return-invitation", invitationId);
  sessionStorage.setItem("plantie.auth.return-path", `/#/join?invitation=${invitationId}`);
}
if (scene === "recovery-restoration-failure") {
  writePasswordRecoveryMarker(sessionStorage, createPasswordRecoveryMarker(provider.seedSession()));
  provider.sessionReadError = true; provider.emitInitial = true;
}
if (scene === "recovery-event-race") { provider.seedSession(); provider.holdSession = true; }
if (scene.startsWith("standalone-")) provider.seedSession();
if (scene.startsWith("marker-")) {
  const marker = createPasswordRecoveryMarker(provider.seedSession())!;
  if (scene === "marker-expired") marker.expiresAt = Date.now() - 1000;
  if (scene === "marker-mismatched") marker.userId = "30000000-0000-4000-8000-000000000003";
  writePasswordRecoveryMarker(sessionStorage, marker);
  if (scene === "marker-malformed") sessionStorage.setItem(passwordRecoveryStorageKey, "{malformed");
}
const root = createRoot(document.getElementById("root")!);
root.render(scene.startsWith("standalone-") ? <StandaloneFixture /> : <Fixture />);
const run = async () => {
  try {
    if (scene === "recovery-event-race") {
      await waitFor(() => provider.releaseSession, "held initial session read");
      provider.emit("PASSWORD_RECOVERY", provider.session); provider.emit("SIGNED_OUT", null); provider.releaseSession!();
    }
    await waitFor(() => (scene.startsWith("standalone-") || currentAuth && !currentAuth.loading) && Boolean(panel()), "initial real auth hook/panel");
    await assertHelpers();
    if (scene === "modes") await exerciseModes();
    else if (scene === "invitation") await exerciseInvitation();
    else if (scene.startsWith("standalone-")) await exerciseStandalone();
    else if (scene.startsWith("marker-")) await exerciseMarker();
    else if (scene === "native-events") await exerciseNativeEvents();
    else if (scene === "recovery-marker-timers") await exerciseExpiryTimers();
    else if (scene === "recovery-flow-generation") await exerciseRecoveryGeneration();
    else if (scene === "native-close-failure") {
      await waitFor(() => currentAuth.isPasswordRecovery && Boolean(password()), "native launch verified recovery despite Browser failure");
      check("Native service establishes verified recovery despite optional Browser import failure", () => assert(calls("exchange").length === 1
        && !currentAuth.invalidRecoveryLink && !currentAuth.callbackError && Boolean(form()), "Optional browser failure invalidated auth"));
      check("Native deep-link success does not imply normal signed-in completion", () => assert(!currentAuth.isAuthenticated && callbacks.signedIn === 0 && !email(), "Native recovery auto-authenticated"));
    }
    else if (scene === "recovery-event-race") {
      check("Newer SIGNED_OUT overrides stale successful session restoration", () => assert(currentAuth.invalidRecoveryLink && !currentAuth.isAuthenticated && !currentAuth.isPasswordRecovery && !form() && !password(), "Stale session restoration authenticated recovery"));
      check("Recovery event race never updates a password or exchanges a callback", () => assert(calls("update").length === 0 && calls("exchange").length === 0, "Recovery race triggered provider mutation"));
    }
    else await exerciseRecovery();
    check("No logged-out auth flow renders authenticated navigation", () => assert(!document.querySelector(".app-tab-nav,.mobile-bottom-nav"), "Authenticated navigation in isolated auth flow"));
    check("Auth controls fit the exact mobile/desktop CSS viewport", assertNoOverflow);
    check("No synthetic password value appears in displayed messages", () => assert(!status()?.textContent?.includes("synthetic-test-password"), "Password leaked in message"));
  } catch (error) { result.failures.push(error instanceof Error ? error.message : String(error)); }
  finally { if (scene === "recovery-marker-timers") { Date.now = originalNow; window.setTimeout = originalSetTimeout; window.clearTimeout = originalClearTimeout; } }
  document.getElementById("auth-flow-browser-results")!.textContent = JSON.stringify(result);
};
void run();
