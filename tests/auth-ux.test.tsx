import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createAuthActions,
  createAuthRedirectUrl,
  validateLoginInput,
  validatePasswordResetInput,
  validatePasswordUpdateInput,
  validateRegistrationInput,
} from "../src/lib/authRules.js";

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
    getRedirectUrl: () => "https://plantie.example/reset",
  });

  await actions.requestPasswordReset("USER@EXAMPLE.COM");

  assert.deepEqual(mock.calls, [
    {
      input: { email: "user@example.com", options: { redirectTo: "https://plantie.example/reset" } },
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

test("auth redirects strip hash routes and query parameters before Supabase callback", () => {
  assert.equal(createAuthRedirectUrl("https://plantie.example/app?householdId=abc#/join?invite=secret"), "https://plantie.example/app");
  assert.equal(createAuthRedirectUrl("not a url"), undefined);
});

test("registration uses a hash-free email confirmation redirect", async () => {
  const mock = createMockAuthClient();
  const actions = createAuthActions({
    getClient: () => mock.client as never,
    getRedirectUrl: () => createAuthRedirectUrl("https://plantie.example/#/menu"),
  });

  await actions.registerWithEmailPassword("USER@EXAMPLE.COM", "password123");

  assert.deepEqual(mock.calls, [
    {
      input: {
        email: "user@example.com",
        options: { emailRedirectTo: "https://plantie.example/" },
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
    /Confirm your email address first/,
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
    /password does not match/,
  );
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
