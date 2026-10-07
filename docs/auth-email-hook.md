# Plantie authentication email delivery

Household invitations and Supabase authentication messages use separate trusted backend paths. `send-household-invite-email` sends the household invitation. `send-auth-email` is a Supabase **Send Email Auth Hook** that sends account confirmation, recovery, magic-link and account-security messages through the existing Resend account.

The hook is needed because the hosted project had email confirmations enabled and no custom SMTP server during the 2026-10-07 audit. Supabase's default sender cannot deliver confirmation messages to arbitrary new recipients. Enabling this hook preserves email verification while using the verified Resend sender.

## Configuration and rollout

1. Set `SEND_EMAIL_HOOK_SECRET` as a Supabase Edge Function secret. Use the same signing secret when configuring the Supabase Auth Send Email hook. Supabase uses the `v1,whsec_<base64-secret>` format. Never expose it through a client-prefixed environment variable.
2. Keep the existing `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `APP_PUBLIC_URL` Edge Function secrets. Optionally set `RESEND_AUTH_FROM_EMAIL` to use a different address under the same verified sending domain.
3. Deploy `send-auth-email` with `verify_jwt = false`. This endpoint is called by Supabase Auth rather than a user session. The function still requires a valid Standard Webhooks payload signature and timestamp before processing any recipient or authentication token.
4. Configure Supabase Auth → Hooks → Send Email to call the deployed Edge Function URL and use the matching signing secret. Keep the Email Provider and email confirmations enabled. Do not enable the hook before the function and required secrets are ready.
5. Retain all existing web, development and native authentication redirects. Permit the callback's `invitation` UUID query when registering from an invitation. The UUID is a navigation hint; the recipient RPC requires the verified matching email before resolving it.
6. Test signup and confirmation using an explicitly authorized test recipient. Confirm that verification returns to the invitation review and does not accept or switch households. Also test password recovery and native confirmation if those flows are being released.

When enabled, the Auth Hook replaces Supabase SMTP delivery. Rollback is to disable the hook and configure a working custom SMTP sender; reverting to the default sender restores its recipient limitations.

## Delivery and security rules

- The hook verifies the raw request body with the pinned `standardwebhooks@1.0.0` verifier. This small Edge-only dependency follows Supabase's official Auth Hook example and avoids custom signature cryptography. The frontend dependency list and lockfile are unchanged.
- Auth verification links use the configured `SUPABASE_URL` `/auth/v1/verify` endpoint, a token **hash**, the action type and Supabase's signed, already-allowlisted `redirect_to`. Web redirects must use HTTPS, loopback HTTP, or private IPv4 LAN HTTP for existing development callbacks. LAN hosts are restricted to `10.0.0.0/8`, `172.16.0.0/12`, and `192.168.0.0/16`; Supabase's configured allowlist still applies before signing. Existing reverse-DNS native authentication schemes remain supported.
- Raw household invitation tokens stay out of Auth redirect query parameters. The invitation review stores only a bounded invitation UUID context for cross-tab recovery. Household acceptance always requires explicit review and the backend's verified recipient check.
- For secure email change, Supabase's field names are reversed: `token_hash_new` belongs to the **current** email address and `token_hash` to the **new** address. Both messages are sent. Without secure email change, only the new address receives its verification message.
- Resend requests have a four-second timeout to fit Supabase's five-second HTTP hook budget. Dual email-change messages are sent concurrently. Retries use stable `webhook-id` plus recipient-index idempotency keys so a partial failure can be retried without duplicating the successful message.
- Logs contain action, webhook ID, provider message ID, provider status/category and timestamp. They never contain addresses, authentication tokens, raw invitation tokens, signing secrets or provider credentials. Provider error bodies are not logged or returned to the client.
- Unsupported, malformed or unsigned events fail closed with generic actionable errors. Successful hook calls return `{}`; failures remain visible to Supabase Auth instead of falsely reporting email success.

## Validation

`tests/auth-email-hook.test.ts` exercises confirmation return context, signature-gate ordering, secure and nonsecure email-change mapping, recovery/native redirects, stable retry keys, provider failure handling, invalid input and security notifications. Signature cryptography itself is delegated to the pinned verifier; deployment checks should additionally confirm that an unsigned request is rejected.

References: [Supabase Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook), [Supabase Auth Hooks timeouts](https://supabase.com/docs/guides/auth/auth-hooks), [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys).
