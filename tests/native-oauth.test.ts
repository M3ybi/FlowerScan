import assert from "node:assert/strict";
import test from "node:test";
import {
  createNativeAuthCallbackHandler,
  NativeAuthCallbackError,
  nativeConfirmationRedirectUrl,
  nativeOAuthRedirectUrl,
  nativeRecoveryRedirectUrl,
  parseNativeAuthCallback,
} from "../src/lib/nativeOAuth.js";

test("native OAuth callback uses the registered app URL", () => {
  assert.equal(nativeOAuthRedirectUrl, "com.plantie.app://auth/callback");
  assert.equal(nativeConfirmationRedirectUrl, "com.plantie.app://auth/confirm");
  assert.equal(nativeRecoveryRedirectUrl, "com.plantie.app://auth/recovery");
});

test("native callback parser distinguishes OAuth, confirmation, and password recovery", () => {
  assert.deepEqual(parseNativeAuthCallback(`${nativeOAuthRedirectUrl}?code=oauth`), {
    code: "oauth", kind: "oauth", flowId: undefined,
  });
  assert.deepEqual(parseNativeAuthCallback(`${nativeConfirmationRedirectUrl}?code=confirmed`), {
    code: "confirmed", kind: "confirmation", flowId: undefined,
  });
  assert.deepEqual(parseNativeAuthCallback(`${nativeRecoveryRedirectUrl}?code=reset&sb_flow_id=flow-1`), {
    code: "reset", kind: "recovery", flowId: "flow-1",
  });
  assert.equal(parseNativeAuthCallback(`${nativeOAuthRedirectUrl}?code=legacy&type=recovery`)?.kind, "recovery");
});

test("native OAuth callback ignores unrelated links", async () => {
  let exchangeCalled = false;
  const handle = createNativeAuthCallbackHandler(async () => {
    exchangeCalled = true;
    return { error: null };
  });
  const handled = await handle("https://plantie.example/auth/callback?code=abc");

  assert.equal(handled, null);
  assert.equal(exchangeCalled, false);
  assert.equal(parseNativeAuthCallback("com.plantie.app://auth/other?code=abc"), null);
  assert.equal(parseNativeAuthCallback("com.plantie.app://attacker@auth/callback?code=abc"), null);
});

test("native OAuth callback exchanges the returned PKCE code", async () => {
  const exchangedCodes: string[] = [];
  const handle = createNativeAuthCallbackHandler(async (code) => {
    exchangedCodes.push(code);
    return { error: null };
  });
  const handled = await handle("com.plantie.app://auth/callback?code=oauth-code");

  assert.deepEqual(handled, { kind: "oauth", status: "completed" });
  assert.deepEqual(exchangedCodes, ["oauth-code"]);
});

test("native OAuth callback surfaces provider errors without exchanging a code", async () => {
  let exchangeCalled = false;
  const handle = createNativeAuthCallbackHandler(async () => {
    exchangeCalled = true;
    return { error: null };
  });

  await assert.rejects(
    handle("com.plantie.app://auth/callback?error=access_denied&error_description=User%20cancelled"),
    (error) => error instanceof NativeAuthCallbackError && error.reason === "provider_error" && !error.message.includes("User cancelled"),
  );
  assert.equal(exchangeCalled, false);
});

test("native callback rejects malformed and conflicting links before exchange", () => {
  for (const url of [
    nativeOAuthRedirectUrl,
    `${nativeOAuthRedirectUrl}?code=first&code=second`,
    `${nativeRecoveryRedirectUrl}?code=valid&type=signup`,
    `${nativeOAuthRedirectUrl}?code=valid&sb_flow_id=one&sb_flow_id=two`,
    `${nativeOAuthRedirectUrl}?code=valid&type=recovery#type=recovery`,
  ]) {
    assert.throws(() => parseNativeAuthCallback(url), (error) => error instanceof NativeAuthCallbackError && error.reason === "invalid_link");
  }
  assert.throws(
    () => parseNativeAuthCallback(`${nativeRecoveryRedirectUrl}?error=access_denied&error_code=otp_expired`),
    (error) => error instanceof NativeAuthCallbackError && error.reason === "expired_link",
  );
});

test("native callback coalesces cold-start and URL-open deliveries", async () => {
  let calls = 0;
  let resolveExchange!: (value: { error: null }) => void;
  const exchange = new Promise<{ error: null }>((resolve) => { resolveExchange = resolve; });
  const handle = createNativeAuthCallbackHandler(async (code, flowId) => {
    assert.equal(code, "one-time-code");
    assert.equal(flowId, "flow-1");
    calls += 1;
    return exchange;
  });
  const callbackUrl = `${nativeRecoveryRedirectUrl}?code=one-time-code&sb_flow_id=flow-1`;

  const fromUrlOpen = handle(callbackUrl);
  const fromLaunchUrl = handle(callbackUrl);
  resolveExchange({ error: null });

  assert.deepEqual(await fromUrlOpen, { kind: "recovery", status: "completed" });
  assert.deepEqual(await fromLaunchUrl, { kind: "recovery", status: "duplicate" });
  assert.deepEqual(await handle(callbackUrl), { kind: "recovery", status: "duplicate" });
  assert.equal(calls, 1);
});

test("native callback exchange failure does not mark a link completed", async () => {
  let calls = 0;
  const handle = createNativeAuthCallbackHandler(async () => {
    calls += 1;
    return { error: calls === 1 ? new Error("token error") : null };
  });
  const callbackUrl = `${nativeConfirmationRedirectUrl}?code=retry-code`;

  await assert.rejects(handle(callbackUrl), (error) => error instanceof NativeAuthCallbackError && error.reason === "exchange_failed");
  assert.deepEqual(await handle(callbackUrl), { kind: "confirmation", status: "completed" });
  assert.equal(calls, 2);
});

test("native callback hides thrown exchange details and rejects route-swapped replay", async () => {
  const failing = createNativeAuthCallbackHandler(async () => {
    throw new Error("private verifier details");
  });
  await assert.rejects(
    failing(`${nativeOAuthRedirectUrl}?code=private-code`),
    (error) => error instanceof NativeAuthCallbackError && error.reason === "exchange_failed" &&
      !error.message.includes("private verifier"),
  );

  const successful = createNativeAuthCallbackHandler(async () => ({ error: null }));
  await successful(`${nativeOAuthRedirectUrl}?code=shared-code`);
  await assert.rejects(
    successful(`${nativeRecoveryRedirectUrl}?code=shared-code`),
    (error) => error instanceof NativeAuthCallbackError && error.reason === "invalid_link",
  );
});
