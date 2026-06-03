import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createAuthActions,
  validateLoginInput,
  validatePasswordResetInput,
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

test("guest mode remains clearly marked as local and limited", () => {
  const source = readFileSync("src/components/AuthPanel.tsx", "utf8");
  const i18nSource = readFileSync("src/lib/i18n.ts", "utf8");
  assert.match(source, /auth\.guest/);
  assert.match(i18nSource, /Continue as guest - local and limited/);
});

test("sign-out requires confirmation and exposes account deletion link", () => {
  const source = readFileSync("src/components/AccountMenu.tsx", "utf8");
  assert.match(source, /Delete account/);
  assert.match(source, /#\/delete-account/);
  assert.match(source, /window\.confirm/);
});
