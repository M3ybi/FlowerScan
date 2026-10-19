# V4 Auth and Resend validation

Status: **VERIFIED_LOCALLY** at application/provider boundaries; hosted settings **UNKNOWN**; actual delivery and OAuth **BLOCKED** without an authorized test environment. No message was sent.

## Architecture and configuration

Email and Google authentication use Supabase Auth. Google login is an external provider configuration, not the Supabase OAuth Server feature; keep `[auth.oauth_server].enabled = false` unless a separate identity-provider requirement is approved.

`send-auth-email/index.ts` uses `standardwebhooks@1.0.0` to verify the original payload, signature and timestamp before trusting recipients or tokens. Auth calls carry no user JWT, so this entrypoint has `verify_jwt = false`; that is safe only with the signature verifier retained. The secret's `v1,whsec_` prefix is normalized server-side. Verification failures return generic 401. Payloads, action, token hash, recipient, identifier and redirect are validated in `_shared/authEmail.ts`. The verification link points to the configured Supabase `/auth/v1/verify` endpoint, carrying the hash/action and signed return URL. Production return URLs must also be in Supabase's redirect allowlist. Secure email change preserves Supabase's token-hash compatibility mapping.

Required configuration from source:

| Name | Requirement / storage |
| --- | --- |
| `SEND_EMAIL_HOOK_SECRET` | Server-only signing secret matching the configured Auth HTTP hook |
| `RESEND_API_KEY` | Server-only Resend API credential |
| `RESEND_AUTH_FROM_EMAIL` | Auth sender; falls back to `RESEND_FROM_EMAIL` if absent |
| `SUPABASE_URL` | Platform-provided project URL for verification links |
| `APP_PUBLIC_URL` | Approved application origin used when a signed payload has no return URL |
| `RESEND_FROM_EMAIL` | Required separately by invitation delivery; verified sender domain |

The direct Resend request uses a fixed HTTPS API URL, per-event/per-recipient `Idempotency-Key: auth-email/<verified-webhook-id>/<index>`, and a four-second AbortSignal deadline that covers the response body. Only an allowlisted provider ID is retained. Provider rejections/transport failures become generic retryable errors. No provider body, recipient, recovery URL, token or credential is logged. Idempotency prevents duplicate provider delivery; it does not promise that the hook itself never runs twice.

## Executed evidence

`tests/auth-email-hook.test.ts` covers templates, signed return-link handling, secure/nonsecure email change, malformed fields/configuration/methods, provider rejection and stable idempotency with a verifier boundary.

`npm run test:auth-signature` adds an offline **actual-entrypoint** Deno test using the real Standard Webhooks adapter. Only outbound fetch is substituted; Deno is granted environment permission and **no network permission**. The test verifies a valid signature, wrong secret, body tampering, old/future timestamps, repeated-event idempotency, sender/link construction, provider 429, rejected transport, safe responses and safe logs. This is not an actual Resend timeout or delivery test; existing deadline tests and the adapter's AbortSignal cover local timeout behavior.

The browser auth suite exercises actual UI/hooks/recovery controllers with synthetic provider events, including logout, stale session generations, refresh failure, invalid recovery state, repeated requests and native handoff boundaries. It cannot establish real signup, confirmation, Google login, email token expiry or native restart against Supabase.

## Exact hosted checks — operator only, not executed

1. In the authorized project's Authentication providers, inspect Email enabled, confirmation policy, signup policy, anonymous sign-in disabled, Google enabled with the correct client/secret and Google Console callback `<SUPABASE_URL>/auth/v1/callback`. Do not copy credentials into reports.
2. In Authentication → URL configuration, check Site URL and exact web callback/recovery URLs plus `com.plantie.app://auth/callback`, `com.plantie.app://auth/confirm` and `com.plantie.app://auth/recovery`. Avoid broad production wildcards. Confirm invitation return context is preserved.
3. In Authentication → Hooks, verify **Send Email** is enabled as an HTTP hook targeting `<SUPABASE_URL>/functions/v1/send-auth-email`. Confirm the signing secret matches the Edge secret, function deployment exists and JWT verification is disabled only for this signed hook. Source code alone does not enable it. See [Supabase Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook).
4. In Edge secrets, check the names above for presence and approved environment, without retrieving values into transcripts. Verify no server secret is a frontend variable.
5. In Resend → Domains, check the actual sending domain is verified and its displayed SPF/DKIM DNS records resolve correctly. Check the sender belongs to that domain, the API key has the intended sending scope and test/production recipients are separated. Follow [Resend domains](https://resend.com/docs/dashboard/domains/introduction). Do not change DNS based on guessed records.
6. In Authentication → Rate Limits, record current email, signup/login, refresh and verification limits. Review CAPTCHA/bot controls and account throughput before selecting production limits. Review Auth logs for errors without exporting tokens or personal links.
7. Record JWT expiry, refresh rotation/reuse and session restrictions. Local config currently uses 3600 seconds, rotation enabled, reuse 10 seconds, signup enabled, anonymous disabled and password minimum 8. Hosted values are UNKNOWN; do not overwrite them from local defaults.

The local `email_sent = 2` is not evidence about hosted limits. Supabase documents that the email limit can be customized with custom SMTP **or a Send Email Hook**; these are separate delivery architectures. See [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits). No arbitrary rate change was made. Set a starting hourly budget from expected peak confirmations + recoveries + email changes, justified burst headroom, Resend account capacity and abuse controls. Record the calculation and review observed 429s; the needed traffic/account inputs are absent here.

## Authorized acceptance sequence

Using only a dedicated test domain/account, record revision, project, time and redacted message IDs: signup → receive/confirm → login → refresh → logout; Google login/cancel/failure; password recovery and return to the correct page; invalid/expired/reused token; repeated recovery to an intentional 429; expired session; network interruption; browser refresh; native restart/deep link. Inspect links privately. Check no duplicate recipient delivery on hook retry. Delete synthetic accounts only under the test environment's cleanup policy.

Invitation acceptance must additionally cover Owner success, Viewer/nonmember denial, six-per-hour admission, retained pending invitation after failure, stable idempotency, expired/revoked denial and retry without rotating a valid link. The V4 client fix preserves `EMAIL_RATE_LIMITED` from a non-2xx SDK response, reaching the existing localized temporary-limit message. It has a 30-second caller deadline and no automatic mail retry. Monthly subscription exhaustion remains a separate error.
