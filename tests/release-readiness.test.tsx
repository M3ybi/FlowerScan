import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { HealthPage, LegalPageView, ReleaseChecklistPage } from "../src/components/ReleasePages.js";
import {
  getReleaseHealthChecks,
  healthPayloadContainsSecretLikeValue,
  legalPages,
  summarizeReleaseHealth,
} from "../src/lib/releaseReadiness.js";
import { handler as deleteAccountHandler } from "../netlify/functions/delete-account-request.js";
import { handler as healthHandler } from "../netlify/functions/health.js";

type TestHandlerResponse = {
  body?: string;
  statusCode: number;
};

test("legal pages render required compliance content", () => {
  for (const page of legalPages) {
    const html = renderToStaticMarkup(<LegalPageView pageId={page.id} />);
    assert.match(html, new RegExp(page.title));
  }

  const privacy = renderToStaticMarkup(<LegalPageView pageId="privacy" />);
  assert.match(privacy, /account identifiers/);
  assert.match(privacy, /Plant photos and AI diagnosis images/);
  assert.match(privacy, /RevenueCat/);
  assert.match(privacy, /Supabase/);
  assert.match(privacy, /OpenAI/);
  assert.match(privacy, /Email reports/);
  assert.match(privacy, /Push notifications/);
  assert.match(privacy, /deletion/i);

  const terms = renderToStaticMarkup(<LegalPageView pageId="terms" />);
  assert.match(terms, /informational only/);
  assert.match(terms, /medical, safety, legal/);
  assert.match(terms, /App Store or Google Play/);
  assert.match(terms, /Uploaded content/);
  assert.match(terms, /Acceptable use/);
});

test("delete account page renders non-destructive request flow", () => {
  const html = renderToStaticMarkup(
    <LegalPageView
      deleteRequestStatus="No data deleted."
      onRequestDeletion={() => undefined}
      pageId="delete-account"
      requestEmail="user@example.com"
      setRequestEmail={() => undefined}
    />,
  );

  assert.match(html, /manual review/i);
  assert.match(html, /does not delete/i);
  assert.match(html, /Request account deletion review/);
});

test("release checklist page renders store readiness sections", () => {
  const html = renderToStaticMarkup(<ReleaseChecklistPage />);
  assert.match(html, /Google Play identity verification/);
  assert.match(html, /Apple Developer Program/);
  assert.match(html, /RevenueCat offerings/);
  assert.match(html, /Netlify env vars/);
  assert.match(html, /Google Play feature graphic/);
});

test("env validation detects missing public config", () => {
  const checks = getReleaseHealthChecks({ viteSupabaseUrl: "https://example.supabase.co" });
  const summary = summarizeReleaseHealth(checks);

  assert.equal(summary.ok, false);
  assert.deepEqual(summary.missing.sort(), ["revenuecat-android", "revenuecat-ios", "supabase-anon"].sort());
});

test("health page does not expose secret values", () => {
  const html = renderToStaticMarkup(
    <HealthPage
      env={{
        viteRevenueCatAndroidKey: "rc_android_secret_value",
        viteRevenueCatIosKey: "rc_ios_secret_value",
        viteSupabaseAnonKey: "anon_secret_value",
        viteSupabaseUrl: "https://example.supabase.co",
      }}
    />,
  );

  assert.doesNotMatch(html, /rc_android_secret_value|rc_ios_secret_value|anon_secret_value/);
  assert.match(html, /present/);
});

test("public health function reports presence only and no secret payload", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-secret-value";
  process.env.REVENUECAT_WEBHOOK_SECRET = "webhook-secret-value";
  process.env.OPENAI_API_KEY = "openai-secret-value";

  const response = (await healthHandler({ httpMethod: "GET" } as never, {} as never, undefined as never)) as TestHandlerResponse;
  assert.equal(response.statusCode, 200);
  assert.ok(response.body);
  assert.doesNotMatch(response.body, /service-role-secret-value|webhook-secret-value|openai-secret-value/);
  assert.equal(healthPayloadContainsSecretLikeValue(JSON.parse(response.body)), false);
});

test("delete account request placeholder never deletes automatically", async () => {
  const response = (await deleteAccountHandler(
    {
      body: JSON.stringify({ contact: "user@example.com", userId: "11111111-1111-4111-8111-111111111111" }),
      httpMethod: "POST",
    } as never,
    {} as never,
    undefined as never,
  )) as TestHandlerResponse;

  assert.equal(response.statusCode, 202);
  const body = JSON.parse(response.body ?? "{}") as { destructiveAction?: boolean; message?: string };
  assert.equal(body.destructiveAction, false);
  assert.match(body.message ?? "", /manual review/i);
});
