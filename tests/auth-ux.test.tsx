import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AuthFlowError,
  createAuthActions,
  createAuthRedirectUrl,
  mapSupabaseAuthError,
  requireWebAuthRedirectUrl,
  validateLoginInput,
  validatePasswordResetInput,
  validatePasswordUpdateInput,
  validateRegistrationInput,
} from "../src/lib/authRules.js";
import { createAuthReturnLocation, createSingleFlightAuthCodeExchange, readWebAuthCallback, safeAuthReturnLocation, safeAuthReturnPath } from "../src/lib/authRedirects.js";

const createMockAuthClient = () => {
  const calls: Array<{ method: string; input: unknown }> = [];
  return {
    calls,
    client: {
      auth: {
        signInWithOAuth: async (input: unknown) => {
          calls.push({ input, method: "signInWithOAuth" });
          return { error: null };
        },
        signInWithOtp: async (input: unknown) => {
          calls.push({ input, method: "signInWithOtp" });
          return { error: null };
        },
        signInWithPassword: async (input: unknown) => {
          calls.push({ input, method: "signInWithPassword" });
          return { error: null };
        },
        signUp: async (input: unknown) => {
          calls.push({ input, method: "signUp" });
          return { error: null };
        },
        resetPasswordForEmail: async (email: string, options: unknown) => {
          calls.push({ input: { email, options }, method: "resetPasswordForEmail" });
          return { error: null };
        },
        updateUser: async (input: unknown) => {
          calls.push({ input, method: "updateUser" });
          return { error: null };
        },
      },
    },
  };
};

test("email registration validation rejects invalid input", () => {
  assert.equal(
    validateRegistrationInput({ confirmPassword: "password123", email: "not-an-email", password: "password123" }),
    "Enter a valid email address.",
  );
  assert.equal(
    validateRegistrationInput({ confirmPassword: "short", email: "user@example.com", password: "short" }),
    "Password must be at least 8 characters.",
  );
  assert.equal(
    validateRegistrationInput({ confirmPassword: "", email: "user@example.com", password: "" }),
    "Enter your password.",
  );
});

test("confirm password mismatch is rejected", () => {
  assert.equal(
    validateRegistrationInput({ confirmPassword: "password124", email: "user@example.com", password: "password123" }),
    "Passwords do not match.",
  );
});

test("login validation requires email and password", () => {
  assert.equal(validateLoginInput({ email: "bad", password: "password123" }), "Enter a valid email address.");
  assert.equal(validateLoginInput({ email: "user@example.com", password: "" }), "Enter your password.");
});

test("password reset trigger calls Supabase reset only after validation", async () => {
  assert.equal(validatePasswordResetInput("bad"), "Enter a valid email address.");
  const mock = createMockAuthClient();
  const actions = createAuthActions({
    getClient: () => mock.client as never,
    getRedirectUrl: (purpose) => createAuthRedirectUrl("https://plantie.example/#/menu", purpose),
  });

  await actions.requestPasswordReset("USER@EXAMPLE.COM");

  assert.deepEqual(mock.calls, [
    {
      input: { email: "user@example.com", options: { redirectTo: "https://plantie.example/auth/recovery" } },
      method: "resetPasswordForEmail",
    },
  ]);
});

test("password update validates confirmation and calls Supabase updateUser", async () => {
  assert.equal(
    validatePasswordUpdateInput({ confirmPassword: "password124", password: "password123" }),
    "Passwords do not match.",
  );

  const mock = createMockAuthClient();
  const actions = createAuthActions({
    getClient: () => mock.client as never,
    getRedirectUrl: () => "https://plantie.example/reset",
  });

  await actions.updatePassword("password123", "password123");

  assert.deepEqual(mock.calls, [
    {
      input: { password: "password123" },
      method: "updateUser",
    },
  ]);
});

test("auth redirects use the current origin and dedicated callback paths", () => {
  assert.equal(createAuthRedirectUrl("https://plantie.example/app?householdId=abc#/join?invite=secret"), "https://plantie.example/auth/callback");
  assert.equal(createAuthRedirectUrl("http://localhost:5173/#/menu"), "http://localhost:5173/auth/callback");
  assert.equal(createAuthRedirectUrl("http://127.0.0.1:5173/#/menu"), "http://127.0.0.1:5173/auth/callback");
  assert.equal(createAuthRedirectUrl("http://[::1]:5173/#/menu", "recovery"), "http://[::1]:5173/auth/recovery");
  assert.equal(createAuthRedirectUrl("http://plantie.local:5173/#/menu"), "http://plantie.local:5173/auth/callback");
  assert.equal(createAuthRedirectUrl("https://flowerscann.netlify.app/#/menu", "recovery"), "https://flowerscann.netlify.app/auth/recovery");
  assert.equal(createAuthRedirectUrl("not a url"), undefined);
  assert.equal(createAuthRedirectUrl("javascript:alert(1)"), undefined);
  assert.equal(createAuthRedirectUrl("https://user:password@example.com/#/menu"), undefined);
});

test("web auth refuses numeric non-loopback IP redirects instead of falling back to the production site", async () => {
  for (const origin of ["http://192.168.0.115:5173", "http://10.0.0.8:5173", "https://[2001:db8::1]:5173"]) {
    assert.equal(createAuthRedirectUrl(`${origin}/#/menu`), undefined);
  }

  const mock = createMockAuthClient();
  const actions = createAuthActions({
    getClient: () => mock.client as never,
    getRedirectUrl: (purpose) => requireWebAuthRedirectUrl("http://192.168.0.115:5173/#/menu", purpose),
  });

  for (const request of [
    () => actions.signInWithGoogle(),
    () => actions.signInWithMagicLink("user@example.com"),
    () => actions.registerWithEmailPassword("user@example.com", "password123"),
    () => actions.requestPasswordReset("user@example.com"),
  ]) {
    await assert.rejects(request, (error: unknown) => error instanceof AuthFlowError && error.code === "unsupported_redirect_origin");
  }
  assert.deepEqual(mock.calls, []);

  await actions.signInWithEmailPassword("user@example.com", "password123");
  assert.equal(mock.calls[0]?.method, "signInWithPassword");
});

test("web auth callbacks require one valid code and keep return paths internal", () => {
  assert.deepEqual(readWebAuthCallback("http://192.168.0.115:5173/auth/callback?code=abc"), {
    kind: "callback", code: "abc", error: false,
  });
  assert.deepEqual(readWebAuthCallback("https://flowerscann.netlify.app/auth/recovery?code=abc"), {
    kind: "recovery", code: "abc", error: false,
  });
  assert.equal(readWebAuthCallback("https://flowerscann.netlify.app/#/menu"), null);
  assert.equal(readWebAuthCallback("https://flowerscann.netlify.app/auth/recovery?code=a&code=b")?.error, true);
  assert.equal(readWebAuthCallback("https://flowerscann.netlify.app/auth/recovery?error_code=otp_expired")?.error, true);
  assert.equal(readWebAuthCallback("https://flowerscann.netlify.app/auth/recovery")?.error, true);
  assert.equal(safeAuthReturnPath("#/menu?section=account"), "#/menu?section=account");
  assert.equal(safeAuthReturnPath("https://evil.example"), "#/menu");
  assert.equal(safeAuthReturnPath("#//evil.example"), "#/menu");
  assert.equal(safeAuthReturnPath("#/\\evil.example"), "#/menu");
});

test("React StrictMode remount exchanges one callback code only once", async () => {
  const exchanged: string[] = [];
  const exchange = createSingleFlightAuthCodeExchange(async (code) => {
    exchanged.push(code);
    await Promise.resolve();
  });
  await Promise.all([exchange("first-code"), exchange("first-code")]);
  await exchange("first-code");
  assert.deepEqual(exchanged, ["first-code"]);
  await exchange("second-code");
  assert.deepEqual(exchanged, ["first-code", "second-code"]);
});

test("auth returns to an authorized household route without accepting external destinations", () => {
  const location = createAuthReturnLocation("http://192.168.0.115:5173/?householdId=123456789012345678#/menu?section=account");
  assert.equal(location, "/?householdId=123456789012345678#/menu?section=account");
  assert.equal(safeAuthReturnLocation(location), location);
  assert.equal(safeAuthReturnLocation("#/menu?section=account"), "/#/menu?section=account");
  assert.equal(createAuthReturnLocation("https://plantie.example/?household=abcdefghijklmnopqr#/"), "/?householdId=abcdefghijklmnopqr#/");
  assert.equal(createAuthReturnLocation("https://plantie.example/?code=secret#/menu"), "/#/menu");
  for (const unsafe of [
    "https://evil.example/#/menu",
    "//evil.example/#/menu",
    "/other#/menu",
    "/?householdId=short#/menu",
    "/?householdId=abcdefghijklmnopqr&householdId=other#/menu",
    "/?next=https://evil.example/#/menu",
  ]) assert.equal(safeAuthReturnLocation(unsafe), "/#/menu");
});

test("registration uses a hash-free email confirmation redirect", async () => {
  const mock = createMockAuthClient();
  const actions = createAuthActions({
    getClient: () => mock.client as never,
    getRedirectUrl: (purpose) => createAuthRedirectUrl("https://plantie.example/#/menu", purpose),
  });

  await actions.registerWithEmailPassword("USER@EXAMPLE.COM", "password123");

  assert.deepEqual(mock.calls, [
    {
      input: {
        email: "user@example.com",
        options: { emailRedirectTo: "https://plantie.example/auth/callback" },
        password: "password123",
      },
      method: "signUp",
    },
  ]);
});

test("Google button flow calls OAuth with Google provider", async () => {
  const mock = createMockAuthClient();
  const actions = createAuthActions({
    getClient: () => mock.client as never,
    getRedirectUrl: () => "https://plantie.example/app",
  });

  await actions.signInWithGoogle();

  assert.deepEqual(mock.calls, [
    {
      input: { options: { redirectTo: "https://plantie.example/app" }, provider: "google" },
      method: "signInWithOAuth",
    },
  ]);
});

test("login explains when email confirmation is still required", async () => {
  const actions = createAuthActions({
    getClient: () =>
      ({
        auth: {
          signInWithPassword: async () => ({ error: { message: "Email not confirmed" } }),
        },
      }) as never,
    getRedirectUrl: () => "https://plantie.example/app",
  });

  await assert.rejects(
    () => actions.signInWithEmailPassword("user@example.com", "password123"),
    /Confirm your email address before signing in/,
  );
});

test("auth errors explain rate limiting and invalid credentials", async () => {
  const resetActions = createAuthActions({
    getClient: () =>
      ({
        auth: {
          resetPasswordForEmail: async () => ({
            error: { code: "over_email_send_rate_limit", message: "email rate limit exceeded", status: 429 },
          }),
        },
      }) as never,
    getRedirectUrl: () => "https://plantie.example/app",
  });

  await assert.rejects(
    () => resetActions.requestPasswordReset("user@example.com"),
    /Too many auth emails were requested/,
  );

  const loginActions = createAuthActions({
    getClient: () =>
      ({
        auth: {
          signInWithPassword: async () => ({ error: { message: "Invalid login credentials" } }),
        },
      }) as never,
    getRedirectUrl: () => "https://plantie.example/app",
  });

  await assert.rejects(
    () => loginActions.signInWithEmailPassword("user@example.com", "password123"),
    /Check your email and password/,
  );
});

test("auth error mapping uses stable codes and avoids account discovery during sign-in", () => {
  assert.equal(mapSupabaseAuthError({ code: "invalid_credentials" }).code, "invalid_credentials");
  assert.equal(mapSupabaseAuthError({ code: "email_not_confirmed" }).code, "unconfirmed_email");
  assert.equal(mapSupabaseAuthError({ code: "user_already_exists" }).code, "existing_account");
  assert.equal(mapSupabaseAuthError({ code: "otp_expired" }).code, "invalid_link");
  assert.equal(mapSupabaseAuthError({ code: "email_address_invalid" }).code, "invalid_email");
  assert.equal(mapSupabaseAuthError({ code: "session_expired" }).code, "session_expired");
  assert.equal(mapSupabaseAuthError({ code: "identity_already_exists" }).code, "provider_conflict");
  assert.equal(mapSupabaseAuthError({ code: "bad_oauth_state" }).code, "oauth_failure");
  assert.equal(mapSupabaseAuthError({ status: 429 }).code, "rate_limited");
});

test("unexpected transport failure is normalized across email auth flows", async () => {
  const actions = createAuthActions({
    getClient: () => ({ auth: { resetPasswordForEmail: async () => { throw new TypeError("Failed to fetch"); } } }) as never,
    getRedirectUrl: () => "https://plantie.example/auth/recovery",
  });
  await assert.rejects(() => actions.requestPasswordReset("user@example.com"), (error: unknown) =>
    mapSupabaseAuthError(error).code === "network");
});

test("Apple and Amazon login are disabled placeholders", () => {
  const source = readFileSync("src/components/AuthPanel.tsx", "utf8");
  const i18nSource = readFileSync("src/lib/i18n.ts", "utf8");
  assert.match(source, /auth\.apple/);
  assert.match(source, /auth\.amazon/);
  assert.match(source, /auth\.comingSoon/);
  assert.match(i18nSource, /Continue with Apple/);
  assert.match(i18nSource, /Continue with Amazon/);
  assert.match(i18nSource, /Coming soon/);
  assert.match(source, /disabled/);
});

test("no household is auto-created after password login", async () => {
  const mock = createMockAuthClient();
  const actions = createAuthActions({
    getClient: () => mock.client as never,
    getRedirectUrl: () => "https://plantie.example/app",
  });

  await actions.signInWithEmailPassword("user@example.com", "password123");

  assert.deepEqual(
    mock.calls.map((call) => call.method),
    ["signInWithPassword"],
  );
});

test("guest mode is no longer rendered in auth UI", () => {
  const source = readFileSync("src/components/AuthPanel.tsx", "utf8");
  const i18nSource = readFileSync("src/lib/i18n.ts", "utf8");
  assert.doesNotMatch(source, /auth\.guest|onGuest/);
  assert.doesNotMatch(i18nSource, /Continue as guest|Guest mode|Hos\\u0165ovsk\\u00fd re\\u017eim/);
});

test("header sign-out requires confirmation and does not expose account deletion", () => {
  const source = readFileSync("src/components/AccountMenu.tsx", "utf8");
  assert.doesNotMatch(source, /Delete account|#\/delete-account/);
  assert.match(source, /window\.confirm/);
});

test("delete account is exposed only from logged-in menu settings", () => {
  const appSource = readFileSync("src/App.tsx", "utf8");
  assert.match(appSource, /auth\.isAuthenticated \? \(/);
  assert.match(appSource, /href="#\/delete-account"/);
});

test("password recovery route renders a dedicated password update mode", () => {
  const appSource = readFileSync("src/App.tsx", "utf8");
  const authPanelSource = readFileSync("src/components/AuthPanel.tsx", "utf8");
  const hookSource = readFileSync("src/hooks/useAuth.ts", "utf8");

  assert.match(hookSource, /PASSWORD_RECOVERY/);
  assert.match(appSource, /auth\.isPasswordRecovery/);
  assert.match(appSource, /initialMode="updatePassword"/);
  assert.match(authPanelSource, /updatePassword\(password, confirmPassword\)/);
});
