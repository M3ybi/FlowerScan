import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthPanel } from "../src/components/AuthPanel";
import { authPanelCopy, authPanelKeyboardMode, authPanelProviders } from "../src/lib/authPanelCopy";
import { minimumAuthPasswordLength } from "../src/lib/authRules";

const renderPanel = (changes: Partial<Parameters<typeof AuthPanel>[0]> = {}) => renderToStaticMarkup(createElement(AuthPanel, {
  language: "en", ...changes,
}));

test("menu appearance is opt-in and the existing invitation/default form presentation is preserved", () => {
  const html = renderPanel();
  assert.doesNotMatch(html, /auth-panel-menu|auth-input-wrap|auth-password-toggle|auth-provider-divider|auth-field-hint|auth-unavailable-note/);
  assert.equal((html.match(/<label class="field">/g) ?? []).length, 3);
  assert.equal((html.match(/type="password"/g) ?? []).length, 2);
  assert.match(html, /class="neutral-action auth-google-button" type="button">/);
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
  assert.match(html, new RegExp(`Use at least ${minimumAuthPasswordLength} characters\\.`));
  assert.match(html, /Confirm your email address before signing in\./);
  const hintId = html.match(/class="auth-field-hint" id="([^"]+)"/)?.[1];
  assert.ok(hintId);
  assert.ok(html.includes(`aria-describedby="${hintId}"`));
  assert.match(html, /Or continue with/);
  assert.match(html, /Plantie never stores passwords directly/);
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
  const update = renderPanel({ appearance: "menu", initialMode: "updatePassword" });
  assert.equal((update.match(/<input /g) ?? []).length, 2);
  assert.doesNotMatch(update, /auth-mode-tabs|auth-provider-list|type="email"/);
  assert.match(update, />New password</);
  assert.match(update, />Update password</);
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
  assert.equal((html.match(/auth-provider-planned/g) ?? []).length, 2);
  assert.equal((html.match(/>Coming soon<\/span>/g) ?? []).length, 2);
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
