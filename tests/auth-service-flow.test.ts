import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { build } from "esbuild";
import {
  AuthFlowError, createAuthActions, mapSupabaseAuthError, normalizeAuthEmail, passwordResetCooldownMs,
  passwordResetRemainingSeconds, resolveAuthFailure, validateAuthEmail,
} from "../src/lib/authRules";
import type { AuthActionsClient, AuthErrorCode, AuthOperation } from "../src/lib/authRules";
import { createPasswordRecoveryCleanup } from "../src/lib/authRecovery";
import { createNativeAuthLinkSuccessEvent, nativeAuthLinkPurpose, nativeAuthLinkSuccessEvent } from "../src/lib/authService";
import { createNativeAuthCallbackHandler } from "../src/lib/nativeOAuth";

const redirect = "https://plantie.example/auth/callback";
const authenticatedUserId = "11111111-1111-4111-8111-111111111111";
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
};
const client = (overrides: Partial<AuthActionsClient["auth"]> = {}): AuthActionsClient => ({ auth: {
  resetPasswordForEmail: async () => ({ error: null }),
  signInWithOAuth: async () => ({ error: null }),
  signInWithOtp: async () => ({ error: null }),
  signInWithPassword: async () => ({ error: null }),
  signUp: async () => ({ error: null, data: { session: null } }),
  updateUser: async () => ({ error: null, data: { user: { id: authenticatedUserId, email: "user@example.com" } } }),
  ...overrides,
} });
const actions = (overrides: Partial<AuthActionsClient["auth"]> = {}, now?: () => number) =>
  createAuthActions({ getClient: () => client(overrides), getRedirectUrl: () => redirect, now });
const rejectsCode = (request: Promise<unknown>, code: AuthErrorCode) => assert.rejects(request, (error: unknown) =>
  error instanceof AuthFlowError && error.code === code);

test("auth submission normalizes email consistently without changing passwords or valid international addresses", async () => {
  const submitted: Array<{ email: string; password?: string }> = [];
  const auth = actions({
    signUp: async (input) => { submitted.push(input); return { error: null }; },
    signInWithPassword: async (input) => { submitted.push(input); return { error: null }; },
    resetPasswordForEmail: async (email) => { submitted.push({ email }); return { error: null }; },
    signInWithOtp: async (input) => { submitted.push(input); return { error: null }; },
  });
  const email = " ÜSER+Tag@EXAMPLE.COM ";
  const password = "  secret with spaces  ";
  assert.equal(normalizeAuthEmail(email), "üser+tag@example.com");
  assert.equal(validateAuthEmail(email), true);
  await auth.registerWithEmailPassword(email, password);
  await auth.signInWithEmailPassword(email, password);
  await auth.requestPasswordReset(email);
  await auth.signInWithMagicLink(email);
  assert.deepEqual(submitted.map((input) => input.email), Array(4).fill("üser+tag@example.com"));
  assert.equal(submitted[0].password, password);
  assert.equal(submitted[1].password, password);
});

test("invalid form data is rejected before any provider request", async () => {
  let calls = 0;
  const auth = createAuthActions({
    getClient: () => { calls += 1; throw new Error("must not reach provider"); },
    getRedirectUrl: () => redirect,
  });
  await rejectsCode(auth.registerWithEmailPassword("bad", "password123"), "invalid_email");
  await rejectsCode(auth.registerWithEmailPassword("user@example.com", "short"), "weak_password");
  await rejectsCode(auth.signInWithEmailPassword("user@example.com", ""), "password_required");
  await rejectsCode(auth.requestPasswordReset(""), "invalid_email");
  await rejectsCode(auth.updatePassword("password123", "mismatch"), "password_mismatch");
  assert.equal(calls, 0);
  assert.equal(auth.getPasswordResetRetryAt(), 0);
});

test("generic credentials never distinguish wrong passwords, unknown accounts, or social-only accounts", () => {
  for (const message of ["Invalid login credentials", "User not found", "Account already registered", "Google account only"]) {
    const guidance = resolveAuthFailure({ code: "invalid_credentials", message }, "login");
    assert.deepEqual(guidance, { code: "invalid_credentials", severity: "error", nextMode: null, actionModes: ["reset", "register"] });
  }
  assert.equal(resolveAuthFailure({ message: "User not found" }, "login").nextMode, null);
  assert.equal(resolveAuthFailure({ message: "Account already registered" }, "register").nextMode, null);
  assert.equal(resolveAuthFailure({ status: 404 }, "login").nextMode, null);
});

test("only explicit provider codes guide users out of the wrong password mode", () => {
  for (const code of ["user_already_exists", "email_exists"]) {
    assert.deepEqual(resolveAuthFailure({ code }, "register"), {
      code: "existing_account", severity: "info", nextMode: "login", actionModes: ["reset"],
    });
  }
  assert.deepEqual(resolveAuthFailure({ code: "user_not_found" }, "login"), {
    code: "user_not_found", severity: "info", nextMode: "register", actionModes: [],
  });
  for (const operation of ["google", "reset", "updatePassword", "register"] as AuthOperation[]) {
    assert.equal(resolveAuthFailure({ code: "user_not_found" }, operation).nextMode, null);
  }
  assert.equal(resolveAuthFailure({ code: "email_exists" }, "google").code, "unavailable");
  assert.equal(resolveAuthFailure({ code: "identity_already_exists" }, "google").code, "provider_conflict");
});

test("Google callback and session failures never offer password-recovery guidance", () => {
  for (const code of ["bad_code_verifier", "flow_state_expired", "flow_state_not_found", "otp_expired", "session_expired", "session_not_found"]) {
    assert.deepEqual(resolveAuthFailure({ code }, "google"), {
      code: "oauth_failure", severity: "error", nextMode: null, actionModes: [],
    });
  }
  assert.deepEqual(resolveAuthFailure(new AuthFlowError("invalid_link"), "google"), {
    code: "oauth_failure", severity: "error", nextMode: null, actionModes: [],
  });
  assert.equal(resolveAuthFailure({ code: "flow_state_expired" }, "updatePassword").code, "invalid_link");
  assert.deepEqual(resolveAuthFailure({ code: "flow_state_expired" }, "updatePassword").actionModes, ["reset"]);
});

test("service errors preserve safe codes without retaining raw provider text, payloads, or identities", async () => {
  const secret = "raw-token-and-private-user-id";
  const auth = actions({ signInWithPassword: async () => ({ error: { code: "invalid_credentials", message: secret, stack: secret, id: secret } }) });
  await assert.rejects(auth.signInWithEmailPassword("user@example.com", "password123"), (error: unknown) => {
    assert.ok(error instanceof AuthFlowError);
    assert.equal(error.code, "invalid_credentials");
    assert.equal(mapSupabaseAuthError(error), error);
    assert.equal(error.message.includes(secret), false);
    assert.equal(JSON.stringify(error).includes(secret), false);
    return true;
  });
});

test("signup without a session stays non-disclosing even with a fake or obfuscated provider user", async () => {
  for (const user of [null, { email: "user@example.com", identities: [] }, { email: "user@example.com", identities: [{ provider: "google" }] }]) {
    const auth = actions({ signUp: async () => ({ error: null, data: { user, session: null } }) });
    const result = await auth.registerWithEmailPassword(" USER@EXAMPLE.COM ", "password123");
    assert.deepEqual(result, { status: "verification_required", email: "user@example.com" });
    assert.equal("user" in result || "identities" in result || "registered" in result, false);
  }
});

test("signup with a provider session follows the authenticated flow without exposing that session", async () => {
  const auth = actions({ signUp: async () => ({ error: null, data: { session: { access_token: "not-returned" }, user: { email: "user@example.com" } } }) });
  assert.deepEqual(await auth.registerWithEmailPassword("user@example.com", "password123"), { status: "signed_in", email: "user@example.com" });
});

test("provider signup failure never produces success or creates a second account", async () => {
  let calls = 0;
  const auth = actions({ signUp: async () => { calls += 1; return { error: { code: "user_already_exists" } }; } });
  await rejectsCode(auth.registerWithEmailPassword("user@example.com", "password123"), "existing_account");
  assert.equal(calls, 1);
});

test("password login never creates a household, retries as signup, or queries account existence", async () => {
  const calls: string[] = [];
  const auth = actions({
    signInWithPassword: async () => { calls.push("login"); return { error: { code: "user_not_found" } }; },
    signUp: async () => { calls.push("signup"); return { error: null }; },
  });
  await rejectsCode(auth.signInWithEmailPassword("user@example.com", "password123"), "user_not_found");
  assert.deepEqual(calls, ["login"]);
  for (const path of ["src/lib/authRules.ts", "src/lib/authRecovery.ts"]) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /auth\.users|\.admin\.|checkUserExists|console\.(?:log|error|warn)/);
  }
});

test("reset requests are non-disclosing and share one UX cooldown across addresses", async () => {
  let now = 1_000;
  let calls = 0;
  const auth = actions({ resetPasswordForEmail: async () => { calls += 1; return { error: null }; } }, () => now);
  const result = await auth.requestPasswordReset(" USER@EXAMPLE.COM ");
  assert.deepEqual(result, { status: "reset_requested", email: "user@example.com", retryAt: now + passwordResetCooldownMs });
  assert.equal(auth.getPasswordResetRetryAt(), result.retryAt);
  await rejectsCode(auth.requestPasswordReset("user@example.com"), "reset_cooldown");
  await rejectsCode(auth.requestPasswordReset("other@example.com"), "reset_cooldown");
  assert.equal(calls, 1);
  now += passwordResetCooldownMs;
  await auth.requestPasswordReset("other@example.com");
  assert.equal(calls, 2);
});

test("even an explicit unknown-user recovery response returns the same generic accepted result", async () => {
  const result = await actions({ resetPasswordForEmail: async () => ({ error: { code: "user_not_found", message: "private account state" } }) }, () => 1_000)
    .requestPasswordReset("user@example.com");
  assert.deepEqual(result, { status: "reset_requested", email: "user@example.com", retryAt: 61_000 });
});

test("a pending reset request blocks duplicate and alternate-email provider calls", async () => {
  const pending = deferred<{ error: null }>();
  let now = 1_000;
  let calls = 0;
  const auth = actions({ resetPasswordForEmail: async () => { calls += 1; return pending.promise; } }, () => now);
  const first = auth.requestPasswordReset("user@example.com");
  now = 100_000;
  await rejectsCode(auth.requestPasswordReset("other@example.com"), "reset_cooldown");
  assert.equal(calls, 1);
  pending.resolve({ error: null });
  assert.equal((await first).retryAt, 160_000);
});

test("provider rate limits retain cooldown while transport errors permit a meaningful retry", async () => {
  const limited = actions({ resetPasswordForEmail: async () => ({ error: { code: "over_email_send_rate_limit", status: 429 } }) }, () => 1_000);
  await rejectsCode(limited.requestPasswordReset("user@example.com"), "rate_limited");
  assert.equal(limited.getPasswordResetRetryAt(), 61_000);
  const network = actions({ resetPasswordForEmail: async () => { throw new TypeError("Failed to fetch"); } }, () => 1_000);
  await rejectsCode(network.requestPasswordReset("user@example.com"), "network");
  assert.equal(network.getPasswordResetRetryAt(), 0);
});

test("cooldown display has deterministic expiry and rejects malformed clocks", () => {
  assert.equal(passwordResetRemainingSeconds(61_000, 1_000), 60);
  assert.equal(passwordResetRemainingSeconds(61_000, 60_999), 1);
  assert.equal(passwordResetRemainingSeconds(61_000, 61_000), 0);
  assert.equal(passwordResetRemainingSeconds(61_000, 80_000), 0);
  assert.equal(passwordResetRemainingSeconds(Number.NaN, 1_000), 0);
});

test("password update returns only the authenticated user's email after provider success", async () => {
  const calls: Array<{ password: string }> = [];
  const auth = actions({ updateUser: async (input) => { calls.push(input); return { error: null, data: { user: { id: authenticatedUserId, email: " USER@EXAMPLE.COM " } } }; } });
  assert.deepEqual(await auth.updatePassword("password123", "password123"), { status: "password_updated", email: "user@example.com" });
  assert.deepEqual(calls, [{ password: "password123" }]);
  assert.deepEqual(await actions({ updateUser: async () => ({ error: null, data: { user: { id: authenticatedUserId } } }) }).updatePassword("password123", "password123"), { status: "password_updated", email: null });
});

test("password update fails closed when provider success lacks a stable authenticated user result", async () => {
  for (const data of [undefined, null, { user: null }, { user: {} }, { user: { id: "not-a-user-id" } }]) {
    await rejectsCode(actions({ updateUser: async () => ({ error: null, data }) }).updatePassword("password123", "password123"), "unavailable");
  }
});

test("failed updates never produce success and expired sessions offer a new recovery request", async () => {
  for (const code of ["same_password", "session_not_found", "otp_expired", "reauthentication_needed"]) {
    const auth = actions({ updateUser: async () => ({ error: { code } }) });
    await assert.rejects(auth.updatePassword("password123", "password123"), (error: unknown) => {
      const guidance = resolveAuthFailure(error, "updatePassword");
      if (code !== "same_password") assert.deepEqual(guidance.actionModes, ["reset"]);
      assert.equal(guidance.nextMode, null);
      return error instanceof AuthFlowError;
    });
  }
  assert.equal(resolveAuthFailure({ code: "user_not_found" }, "updatePassword").code, "session_expired");
  assert.equal(mapSupabaseAuthError({ name: "AuthSessionMissingError" }).code, "session_expired");
});

test("recovery cleanup signs out only the current session and confirms local removal", async () => {
  const calls: unknown[] = [];
  const finish = createPasswordRecoveryCleanup(() => ({ auth: {
    signOut: async (options) => { calls.push(options); return { error: null }; },
    getSession: async () => { calls.push("getSession"); return { error: null, data: { session: null } }; },
  } }));
  await finish();
  assert.deepEqual(calls, [{ scope: "local" }, "getSession"]);
});

test("cleanup failure after a successful password update retries cleanup without updating the password again", async () => {
  let updates = 0;
  let cleanups = 0;
  const auth = actions({ updateUser: async () => { updates += 1; return { error: null, data: { user: { id: authenticatedUserId } } }; } });
  const finish = createPasswordRecoveryCleanup(() => ({ auth: {
    signOut: async () => { cleanups += 1; return { error: cleanups === 1 ? { status: 500, message: "private internal error" } : null }; },
    getSession: async () => ({ error: null, data: { session: null } }),
  } }));
  const updated = await auth.updatePassword("password123", "password123");
  assert.equal(updated.status, "password_updated");
  await rejectsCode(finish(), "recovery_cleanup_failed");
  await finish();
  assert.equal(updates, 1);
  assert.equal(cleanups, 2);
});

test("successful signout with a retained, unreadable, or malformed session fails closed", async () => {
  for (const result of [
    { error: null, data: { session: {} } }, { error: new Error("private error"), data: { session: null } },
    { error: null, data: {} },
  ]) {
    const finish = createPasswordRecoveryCleanup(() => ({ auth: {
      signOut: async () => ({ error: null }),
      getSession: async () => result as never,
    } }));
    await rejectsCode(finish(), "recovery_cleanup_failed");
  }
});

test("concurrent cleanup requests share a single session operation and can retry after a failure", async () => {
  const response = deferred<{ error: unknown }>();
  let calls = 0;
  const finish = createPasswordRecoveryCleanup(() => ({ auth: {
    signOut: async () => { calls += 1; return calls === 1 ? response.promise : { error: null }; },
    getSession: async () => ({ error: null, data: { session: null } }),
  } }));
  const first = finish();
  const duplicate = finish();
  assert.equal(first, duplicate);
  response.resolve({ error: new Error("private failure") });
  await Promise.all([rejectsCode(first, "recovery_cleanup_failed"), rejectsCode(duplicate, "recovery_cleanup_failed")]);
  assert.equal(calls, 1);
  await finish();
  assert.equal(calls, 2);
});

test("native link errors retain only the strict callback purpose, not tokens or provider descriptions", () => {
  assert.equal(nativeAuthLinkPurpose("com.plantie.app://auth/recovery?error_code=otp_expired&error_description=private"), "recovery");
  assert.equal(nativeAuthLinkPurpose("com.plantie.app://auth/recovery?code=private"), "recovery");
  assert.equal(nativeAuthLinkPurpose("com.plantie.app://auth/callback?error=access_denied&type=recovery"), "recovery");
  assert.equal(nativeAuthLinkPurpose("com.plantie.app://auth/callback#type=recovery&error=access_denied"), "recovery");
  assert.equal(nativeAuthLinkPurpose("com.plantie.app://auth/confirm?error=private"), "confirmation");
  assert.equal(nativeAuthLinkPurpose("com.plantie.app://auth/callback?error=private"), "oauth");
  for (const unsafe of ["not-a-url", "https://plantie.example/auth/recovery", "com.plantie.app://attacker@auth/recovery", "com.plantie.app://auth:123/recovery", "com.plantie.app://auth/other"]) {
    assert.equal(nativeAuthLinkPurpose(unsafe), null);
  }
});

test("native completion events contain only a trusted completed callback purpose", () => {
  for (const kind of ["oauth", "confirmation", "recovery"] as const) {
    const event = createNativeAuthLinkSuccessEvent({ kind, status: "completed" });
    assert.equal(event?.type, nativeAuthLinkSuccessEvent);
    assert.deepEqual(event?.detail, { kind });
    assert.deepEqual(Object.keys(event!.detail), ["kind"]);
    assert.equal(createNativeAuthLinkSuccessEvent({ kind, status: "duplicate" }), null);
  }
  assert.equal(createNativeAuthLinkSuccessEvent(null), null);
});

test("native completion waits for the provider exchange and never repeats a completed or failed delivery", async () => {
  const response = deferred<{ error: unknown }>();
  const handle = createNativeAuthCallbackHandler(async () => response.promise);
  const events: CustomEvent[] = [];
  const target = new EventTarget();
  target.addEventListener(nativeAuthLinkSuccessEvent, (event) => events.push(event as CustomEvent));
  const deliver = async (url: string) => {
    const event = createNativeAuthLinkSuccessEvent(await handle(url));
    if (event) target.dispatchEvent(event);
  };
  const url = "com.plantie.app://auth/confirm?code=private-test-code";
  const first = deliver(url);
  const coldStartDuplicate = deliver(url);
  assert.equal(events.length, 0);
  response.resolve({ error: null });
  await Promise.all([first, coldStartDuplicate]);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].detail, { kind: "confirmation" });
  assert.equal(JSON.stringify(events[0].detail).includes("private-test-code"), false);
  await deliver(url);
  await deliver("https://unregistered.example/auth/confirm?code=private");
  assert.equal(events.length, 1);

  const failedHandle = createNativeAuthCallbackHandler(async () => ({ error: new Error("private provider data") }));
  let failedEvent: CustomEvent | null = null;
  await assert.rejects(async () => {
    failedEvent = createNativeAuthLinkSuccessEvent(await failedHandle("com.plantie.app://auth/recovery?code=failed-test-code"));
  });
  assert.equal(failedEvent, null);
});

test("a native browser module failure cannot turn completed authentication into an auth error", async () => {
  const boundary = { exchanges: 0, browserImports: 0 };
  const testGlobal = globalThis as typeof globalThis & { __nativeCleanupBoundary?: typeof boundary };
  testGlobal.__nativeCleanupBoundary = boundary;
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const target = new EventTarget();
  const events: Array<{ type: string; detail: unknown }> = [];
  for (const type of [nativeAuthLinkSuccessEvent, "planti-native-auth-link-error"]) {
    target.addEventListener(type, (event) => events.push({ type, detail: (event as CustomEvent).detail }));
  }
  Object.defineProperty(globalThis, "window", { configurable: true, value: Object.assign(target, {
    sessionStorage: { getItem: () => null, removeItem: () => undefined },
    localStorage: { getItem: () => null },
  }) });
  try {
    const compiled = await build({
      stdin: { contents: `export { ensureNativeAuthListener } from ${JSON.stringify(resolve("src/lib/authService.ts"))};`, resolveDir: process.cwd(), loader: "ts" },
      bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent",
      plugins: [{ name: "native-cleanup-external-boundaries", setup(builder) {
        builder.onResolve({ filter: /^@capacitor\/(?:core|app|browser)$/ }, ({ path }) => ({ path, namespace: "auth-boundary" }));
        builder.onResolve({ filter: /^\.\/supabase$/ }, ({ path }) => ({ path, namespace: "auth-boundary" }));
        builder.onResolve({ filter: /^\.\/plantieRepository$/ }, ({ path }) => ({ path, namespace: "auth-boundary" }));
        builder.onLoad({ filter: /.*/, namespace: "auth-boundary" }, ({ path }) => {
          const contents = path === "@capacitor/core" ? "export const Capacitor = { isNativePlatform: () => true };"
            : path === "@capacitor/app" ? `export const App = { addListener: async () => ({ remove: async () => {} }), getLaunchUrl: async () => ({ url: "com.plantie.app://auth/confirm?code=synthetic-native-cleanup" }) };`
              : path === "@capacitor/browser" ? `globalThis.__nativeCleanupBoundary.browserImports += 1; throw new Error("private module load failure"); export const Browser = { close: async () => {} };`
                : path === "./supabase" ? `export const supabase = { auth: { exchangeCodeForSession: async () => { globalThis.__nativeCleanupBoundary.exchanges += 1; return { error: null }; } } };`
                  : "export const getUserHouseholds = async () => [];";
          return { contents, loader: "js" };
        });
      } }],
    });
    const fixture = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`) as {
      ensureNativeAuthListener(): Promise<void>;
    };
    await fixture.ensureNativeAuthListener();
    assert.deepEqual(boundary, { exchanges: 1, browserImports: 1 });
    assert.deepEqual(events, [{ type: nativeAuthLinkSuccessEvent, detail: { kind: "confirmation" } }]);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    delete testGlobal.__nativeCleanupBoundary;
  }
});
