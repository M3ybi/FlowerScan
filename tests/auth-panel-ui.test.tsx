import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthMessage, AuthPanel } from "../src/components/AuthPanel";
import { authPanelCopy, authPanelFieldErrors, authPanelKeyboardMode, authPanelNoticeContent, authPanelProviders, authPanelVisibleFieldErrors } from "../src/lib/authPanelCopy";
import { minimumAuthPasswordLength } from "../src/lib/authRules";

const renderPanel = (changes: Partial<Parameters<typeof AuthPanel>[0]> = {}) => renderToStaticMarkup(createElement(AuthPanel, {
  language: "en", ...changes,
}));

test("recovery has the same accessible lock fields and reveal controls as account auth", () => {
  const html = renderPanel({ initialMode: "updatePassword" });
  assert.equal((html.match(/class="auth-password-toggle"/g) ?? []).length, 2);
  assert.equal((html.match(/lucide-lock-keyhole auth-input-icon/g) ?? []).length, 2);
  assert.equal((html.match(/autoComplete="new-password"/gi) ?? []).length, 2);
  assert.equal((html.match(/<label class="auth-menu-field-label" for=/g) ?? []).length, 2);
  assert.doesNotMatch(html, /type="email"|auth-provider-list|auth-mode-tabs/);
});

test("compact menu email uses an email keyboard and leaves validation to associated inline errors", () => {
  const html = renderPanel({ appearance: "menu" });
  assert.match(html, /<input[^>]*type="email"[^>]*inputMode="email"[^>]*autoComplete="email"/i);
  assert.match(html, /<form[^>]*noValidate=""/i);
  assert.doesNotMatch(html, /aria-invalid="true"|auth-field-error/);
  assert.equal((html.match(/required=""/g) ?? []).length, 3);
});

test("compact menu keeps Google separate and removes unavailable planned provider rows", () => {
  const html = renderPanel({ appearance: "menu" });
  assert.equal((html.match(/auth-provider-option/g) ?? []).length, 1);
  assert.match(html, /Continue with Google/);
  assert.doesNotMatch(html, /Continue with Apple|Continue with Amazon|Coming soon/);
  const existing = renderPanel();
  assert.match(existing, /Continue with Apple/);
  assert.match(existing, /Continue with Amazon/);
  assert.equal((existing.match(/>Coming soon<\/span>/g) ?? []).length, 2);
});

test("invitation/default forms share the accessible fields while menu density remains opt-in", () => {
  const html = renderPanel();
  assert.doesNotMatch(html, /auth-panel-menu/);
  assert.equal((html.match(/<label class="auth-menu-field-label" for=/g) ?? []).length, 3);
  assert.equal((html.match(/type="password"/g) ?? []).length, 2);
  assert.equal((html.match(/auth-password-toggle/g) ?? []).length, 2);
  assert.match(html, /role="tab"/);
  assert.match(html, /auth-provider-divider/);
  assert.match(html, /auth-google-button auth-provider-option/);
});

test("menu registration has explicit associated field labels and accessible password visibility controls", () => {
  const html = renderPanel({ appearance: "menu" });
  assert.match(html, /auth-panel-menu/);
  const inputIds = Array.from(html.matchAll(/<input id="([^"]+)"/g), (match) => match[1]);
  const labels = Array.from(html.matchAll(/<label class="auth-menu-field-label" for="([^"]+)"/g), (match) => match[1]);
  assert.equal(inputIds.length, 3);
  assert.deepEqual(labels, inputIds);
  assert.match(html, /type="button"[^>]*aria-label="Show password"[^>]*aria-pressed="false"/);
  assert.match(html, /type="button"[^>]*aria-label="Show confirmation password"[^>]*aria-pressed="false"/);
  assert.equal((html.match(/class="auth-password-toggle"/g) ?? []).length, 2);
  assert.equal((html.match(/type="password"/g) ?? []).length, 2, "passwords begin hidden");
  assert.match(html, new RegExp(`At least ${minimumAuthPasswordLength} characters\\.`));
  assert.match(html, /Confirm your email to sign in\./);
  const hintId = html.match(/class="auth-field-hint" id="([^"]+)"/)?.[1];
  assert.ok(hintId);
  assert.ok(html.includes(`aria-describedby="${hintId}"`));
  assert.match(html, /Or continue with/);
  assert.match(html, /Authentication is handled by Supabase Auth\./);
  assert.doesNotMatch(html, /Plantie never stores passwords directly/);
  assert.equal((html.match(/lucide-lock-keyhole/g) ?? []).length, 2);
  assert.match(html, /placeholder="Create a password"/);
  assert.match(html, /placeholder="Repeat your password"/);
});

test("sign-in, reset and password-update modes expose only their existing required fields", () => {
  const login = renderPanel({ appearance: "menu", initialMode: "login" });
  assert.equal((login.match(/<input /g) ?? []).length, 2);
  assert.equal((login.match(/auth-password-toggle/g) ?? []).length, 1);
  assert.match(login, /autoComplete="current-password"/i);
  assert.doesNotMatch(login, /auth-field-hint|auth-verification-note/);
  const reset = renderPanel({ appearance: "menu", initialMode: "reset" });
  assert.equal((reset.match(/<input /g) ?? []).length, 1);
  assert.doesNotMatch(reset, /auth-password-toggle|type="password"/);
  assert.match(reset, />Send reset email</);
  const update = renderPanel({ initialMode: "updatePassword" });
  assert.equal((update.match(/<input /g) ?? []).length, 2);
  assert.doesNotMatch(update, /auth-mode-tabs|auth-provider-list|type="email"/);
  assert.match(update, />New password</);
  assert.match(update, />Update password</);
  assert.match(update, /autoComplete="new-password"/i);
  assert.equal(renderPanel({ appearance: "menu", initialMode: "updatePassword" }).replace("auth-panel auth-panel-menu", "auth-panel"), update, "menu density does not alter recovery fields or semantics");
});

test("unusable recovery never renders a password form and offers a new reset link", () => {
  for (const key of ["invalid_link", "session_expired", "reauthentication_required"] as const) {
    const html = renderPanel({ initialMode: "updatePassword", initialNotice: { key, severity: "warning" } });
    assert.doesNotMatch(html, /<form|<input|Update password|auth-mode-tabs|auth-provider-list/);
    assert.match(html, /auth-message-warning/);
    assert.match(html, /Request a new reset link/);
    assert.ok(html.includes(authPanelNoticeContent(key, "en").body));
  }
});

test("normal sign-in failure keeps sign-in fields and presents safe reset/create actions", () => {
  const html = renderPanel({ initialMode: "login", initialEmail: " USER@EXAMPLE.TEST ", initialNotice: {
    key: "invalid_credentials", severity: "error", actionModes: ["reset", "register"],
  } });
  assert.match(html, /aria-selected="true"[^>]*>Sign in</);
  assert.equal((html.match(/<input /g) ?? []).length, 2);
  assert.match(html, /value="user@example\.test"/);
  assert.match(html, /auth-message-error[^>]*role="alert"/);
  assert.match(html, /auth-message-actions/);
  assert.doesNotMatch(html, /No account|wrong password|does not exist|Supabase error/);
  assert.match(html, />Reset password</);
  assert.match(html, />Create account</);
});

test("success notices remain conditional and recovery handoff requests normal sign-in", () => {
  const verification = renderPanel({ initialNotice: { key: "verification_requested", severity: "success" } });
  assert.match(verification, /If registration can proceed/);
  assert.doesNotMatch(verification, /Account created|email was sent|already exists/);
  const reset = renderPanel({ initialMode: "reset", initialNotice: { key: "reset_requested", severity: "success" } });
  assert.match(reset, /If an account uses this email/);
  assert.doesNotMatch(reset, /does not exist|email was sent/);
  const changed = renderPanel({ initialMode: "login", initialNotice: { key: "password_changed", severity: "success" } });
  assert.match(changed, /Password changed/);
  assert.match(changed, /Sign in with your new password/);
  assert.match(changed, /autoComplete="current-password"/i);
  assert.doesNotMatch(changed, /autoComplete="new-password"/i);
});

test("shared auth messages announce severity and escape dynamic content", () => {
  for (const severity of ["success", "info", "warning", "error"] as const) {
    const html = renderToStaticMarkup(createElement(AuthMessage, { severity, title: "<script>unsafe</script>", children: "<img src=x onerror=alert(1)>" }));
    assert.match(html, new RegExp(`auth-message-${severity}`));
    assert.match(html, new RegExp(`role="${severity === "error" ? "alert" : "status"}"`));
    assert.match(html, /tabindex="-1"/i);
    assert.match(html, /aria-hidden="true"/);
    assert.doesNotMatch(html, /<script>|<img/);
    assert.match(html, /&lt;script&gt;/);
  }
});

test("recovery and result copy is localized for all supported languages", () => {
  const keys = ["password_changed", "verification_requested", "reset_requested", "signed_in", "existing_account", "user_not_found",
    "invalid_link", "session_expired", "reauthentication_required", "same_password", "reset_cooldown", "recovery_cleanup_failed"] as const;
  for (const language of ["en", "sk", "de", "fr", "es"] as const) {
    const copy = authPanelCopy(language);
    assert.ok(copy.confirmNewPassword && copy.newPasswordPlaceholder && copy.requestNewReset && copy.finishRecovery && copy.finishingRecovery);
    assert.ok(copy.resendCountdown(27).includes("27"));
    for (const key of keys) {
      const content = authPanelNoticeContent(key, language);
      assert.ok(content.title && content.body);
      assert.doesNotMatch(content.body, /auth\.error\./);
      if (language !== "en") assert.notEqual(content.body, authPanelNoticeContent(key, "en").body);
    }
    const recovery = renderPanel({ initialMode: "updatePassword", language });
    assert.ok(recovery.includes(copy.confirmNewPassword));
    assert.ok(recovery.includes(copy.newPasswordPlaceholder));
  }
});

test("menu auth tabs expose selection, unique panel association and a single tab stop", () => {
  const html = renderPanel({ appearance: "menu", initialMode: "login" });
  assert.equal((html.match(/role="tab"/g) ?? []).length, 3);
  assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1);
  assert.equal((html.match(/tabindex="0"/gi) ?? []).length, 1);
  assert.equal((html.match(/tabindex="-1"/gi) ?? []).length, 2);
  const panel = html.match(/<form[^>]*id="([^"]+)"[^>]*role="tabpanel"[^>]*aria-labelledby="([^"]+)"/);
  assert.ok(panel);
  assert.equal((html.match(new RegExp(`aria-controls="${panel[1]}"`, "g")) ?? []).length, 3);
  assert.ok(html.includes(`id="${panel[2]}" role="tab" aria-selected="true"`));
});

test("auth tab keyboard navigation wraps and supports Home/End without handling unrelated keys", () => {
  assert.equal(authPanelKeyboardMode("register", "ArrowLeft"), "reset");
  assert.equal(authPanelKeyboardMode("reset", "ArrowRight"), "register");
  assert.equal(authPanelKeyboardMode("login", "ArrowLeft"), "register");
  assert.equal(authPanelKeyboardMode("login", "ArrowRight"), "reset");
  assert.equal(authPanelKeyboardMode("login", "Home"), "register");
  assert.equal(authPanelKeyboardMode("register", "End"), "reset");
  for (const key of ["Tab", "Enter", " ", "ArrowDown", "Escape"]) assert.equal(authPanelKeyboardMode("login", key), null);
  assert.equal(authPanelKeyboardMode("updatePassword", "ArrowRight"), null);
});

test("central provider availability enables only configured Google and keeps planned providers disabled", () => {
  assert.deepEqual(authPanelProviders(true).map(({ id, enabled }) => ({ id, enabled })), [
    { id: "google", enabled: true }, { id: "apple", enabled: false }, { id: "amazon", enabled: false },
  ]);
  assert.ok(authPanelProviders(false).every((provider) => !provider.enabled));
  const html = renderPanel({ appearance: "menu" });
  assert.match(html, /role="group" aria-label="Sign-in providers"/);
  assert.match(html, /auth-google-button[^>]*type="button" disabled=""/);
  assert.doesNotMatch(html, /auth-provider-planned|Coming soon/);
  assert.match(html, /<button class="primary-action" type="submit" disabled=""/);
  assert.match(html, /Sign-in is temporarily unavailable in this build/);
});

test("invitation email remains prefilled and read-only in the menu presentation", () => {
  const html = renderPanel({ appearance: "menu", invitationId: "00000000-0000-4000-8000-000000000001", initialEmail: "INVITED@EXAMPLE.COM" });
  assert.match(html, /type="email"[^>]*readOnly=""[^>]*value="invited@example\.com"/i);
  assert.doesNotMatch(html, /00000000-0000-4000-8000-000000000001/);
});

test("all supported languages localize the added labels and derive the actual minimum password length", () => {
  for (const language of ["en", "sk", "de", "fr", "es"] as const) {
    const copy = authPanelCopy(language);
    const html = renderPanel({ appearance: "menu", language });
    assert.ok(html.includes(copy.passwordHint(minimumAuthPasswordLength)));
    assert.ok(html.includes(copy.providerDivider));
    assert.ok(html.includes(`aria-label="${copy.showPassword}"`));
    assert.ok(copy.confirmationHint && copy.unavailable && copy.showConfirmation && copy.hideConfirmation);
    assert.ok(html.includes(`placeholder="${copy.createPasswordPlaceholder}"`));
    assert.ok(html.includes(`placeholder="${copy.confirmationPlaceholder}"`));
    assert.ok(copy.emailRequired && copy.confirmationRequired && copy.security && copy.googleLoading);
    assert.equal(new Set(Object.values(copy.loading)).size, 4, "loading copy describes the actual requested mode");
    assert.ok(copy.passwordHint(13).includes("13"));
    if (language !== "en") assert.notEqual(copy.showPassword, authPanelCopy("en").showPassword);
  }
});

test("concurrent menu/invitation auth panels have independent tab and field IDs", () => {
  const props = { appearance: "menu" as const, language: "en" as const };
  const html = renderToStaticMarkup(createElement("div", null, createElement(AuthPanel, { ...props, key: "menu" }), createElement(AuthPanel, { ...props, key: "invite" })));
  const ids = Array.from(html.matchAll(/ id="([^"]+)"/g), (match) => match[1]);
  assert.equal(ids.length, 16);
  assert.equal(new Set(ids).size, ids.length);
  for (const match of html.matchAll(/aria-controls="([^"]+)"/g)) assert.ok(ids.includes(match[1]));
});

const validRegistration = { mode: "register" as const, email: "user@example.test", password: "password123", confirmPassword: "password123" };

test("inline validation covers required fields and uses the existing auth constraints", () => {
  assert.deepEqual(authPanelFieldErrors(validRegistration), {});
  assert.deepEqual(authPanelFieldErrors({ ...validRegistration, email: "  ", password: "", confirmPassword: "" }), {
    email: "email_required", password: "password_required", confirmation: "confirmation_required",
  });
  assert.deepEqual(authPanelFieldErrors({ ...validRegistration, email: "bad", password: "short", confirmPassword: "different" }), {
    email: "invalid_email", password: "weak_password", confirmation: "password_mismatch",
  });
  assert.deepEqual(authPanelFieldErrors({ ...validRegistration, password: "1".repeat(minimumAuthPasswordLength), confirmPassword: "1".repeat(minimumAuthPasswordLength) }), {});
  for (const email of [" user+plants@example.test ", "δοκιμή@παράδειγμα.δοκιμή", "používateľ@príklad.sk"]) {
    assert.equal(authPanelFieldErrors({ ...validRegistration, email }).email, undefined, "presentation must not add stricter email rules");
  }
});

test("client field errors appear after touch or submission and disappear when corrected", () => {
  const errors = authPanelFieldErrors({ ...validRegistration, email: "bad", confirmPassword: "wrong-password" });
  assert.deepEqual(authPanelVisibleFieldErrors(errors, [], false), {}, "a pristine form has no errors");
  assert.deepEqual(authPanelVisibleFieldErrors(errors, ["confirmation"], false), { confirmation: "password_mismatch" }, "mismatch is reported before submission after confirming");
  assert.deepEqual(authPanelVisibleFieldErrors(errors, ["email"], false), { email: "invalid_email" });
  assert.deepEqual(authPanelVisibleFieldErrors(errors, [], true), errors, "submit exposes all relevant errors");
  assert.deepEqual(authPanelVisibleFieldErrors(authPanelFieldErrors(validRegistration), ["email", "password", "confirmation"], true), {}, "editing to valid values removes stale inline errors");
});

test("client validation follows each mode and does not impose registration rules on sign-in", () => {
  assert.deepEqual(authPanelFieldErrors({ ...validRegistration, mode: "login", password: "", confirmPassword: "wrong" }), { password: "password_required" });
  assert.deepEqual(authPanelFieldErrors({ ...validRegistration, mode: "login", password: "short", confirmPassword: "" }), {}, "sign-in uses the existing nonempty password rule");
  assert.deepEqual(authPanelFieldErrors({ ...validRegistration, mode: "reset", password: "", confirmPassword: "" }), {});
  assert.deepEqual(authPanelFieldErrors({ ...validRegistration, mode: "reset", email: "bad", password: "", confirmPassword: "" }), { email: "invalid_email" });
  assert.deepEqual(authPanelFieldErrors({ ...validRegistration, mode: "updatePassword", email: "" }), {}, "recovery validates its existing password confirmation only");
});
