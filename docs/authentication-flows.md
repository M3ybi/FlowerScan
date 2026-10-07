# Plantie authentication flows

`authRules.ts` owns input validation, normalized email submission, provider error mapping, operation-specific guidance and the reset-email cooldown. `authService.ts` owns Supabase calls and web/native redirects. `AuthPanel` renders those outcomes using localized, finite message keys; provider payloads and raw error text never appear in the form.

## Account guidance and abuse protection

Supabase deliberately returns the same password sign-in error for an unknown email, a wrong password and some provider-only accounts. Plantie keeps that error on Sign in and offers Reset password and Create account. It never claims the password alone is wrong or infers account existence from a returned signup user or its identities. Only explicit, relevant provider error codes can select another mode. A successful signup without a usable session displays conditional confirmation guidance, including when Supabase obfuscates an existing account.

No account-lookup endpoint, Auth admin query or client-accessible user directory was added. Supabase's server rate limits remain authoritative. Reset requests additionally use a shared 60-second, in-memory UI cooldown and an in-flight guard; closing/reloading the app does not constitute server abuse protection. Provider rate-limit errors remain actionable generic messages. Email is trimmed and lowercased at submission and mode changes; mode changes clear passwords and stale messages.

## Password recovery lifecycle

The recovery callback must establish a verified Supabase `PASSWORD_RECOVERY` session before displaying Set new password. `useAuth` retains that gate across `USER_UPDATED`: the event happens before the update request has resolved. After an actual successful update, the form clears both passwords, enters completion, signs out only the current recovery session, and verifies that the local session is absent. Only then does App release the gate and show Menu's Sign in tab with a one-time success notice and, when available, the normalized email. This handoff stays in React memory; the URL contains no email, password, message or session credential.

If updating fails, the form remains in recovery. If only session cleanup fails after a confirmed update, a separate Finish reset action retries cleanup without updating the password again. Invalid, expired or reused links show a request-new-link action instead of a usable update form. A reset request must still be explicitly submitted after leaving that screen.

A tab-local marker containing only the already-known session user ID and original session expiry preserves a verified flow across reloads and React StrictMode initialization. It is a navigation hint, never authorization. It must match the current session and be unexpired; provider authorization still applies to every update. Focus refresh and expiry invalidate an unusable flow. Completion removes the marker. Storage restrictions do not prevent the live verified flow from working.

Each newly verified recovery or normal callback advances a flow generation. Password-update and cleanup completions from an older flow cannot clear a newer session or replace its navigation. A new recovery link also resets the form instance, replaces its expiry timer and clears obsolete callback errors. Failed normal callbacks retain an existing recovery gate; only a trusted normal completion or explicit successful sign-in releases it.

Recovery does not consume saved invitation return context. After subsequent login, a pending invitation returns to explicit review; it is never automatically accepted. Confirmation and Google callbacks retain their existing invitation-aware return behavior. All callbacks strip authentication credentials from the URL after processing.

## Provider configuration and rollout

Read-only public hosted settings checked on 2026-10-07 confirm email and Google enabled, signup enabled and email confirmation required. Apple and Amazon remain unavailable. Public settings do not expose the hosted password minimum, redirect allowlist or exact rate-limit values; these were not independently verified or changed through an administrative API during this change.

The application requires eight password characters, and the local Supabase configuration now matches that requirement, Vite's default development origin, email verification and a 60-second email resend interval. Local configuration changes do not change the hosted project. Keep the hosted password requirement and displayed application requirement aligned; stronger provider requirements still fail safely through the mapped weak-password response.

Hosted deployment must retain the configured production origin's `/auth/callback` and `/auth/recovery` redirects, development callbacks used by the team and the registered `com.plantie.app://auth/callback`, `/confirm` and `/recovery` native routes. Confirmation redirects may carry the bounded invitation UUID. Follow `auth-email-hook.md` for verified Resend delivery and `native-google-auth.md` for Android/iOS registration. PKCE email links must complete in the initiating browser/device that owns the verifier; a missing verifier produces the invalid-link flow. No implicit-token fallback is introduced.

## Validation

`test:auth-ux`, `test:auth-service-flow` and `test:auth-panel-ui` cover validation, operation-specific routing, non-disclosing provider outcomes, cooldown/concurrency and completion cleanup. `test:auth-flow-browser` uses isolated browser profiles with the actual components, hook and service while replacing the Supabase boundary. It exercises recovery event ordering, successful handoff, failures, expiry, cleanup retry, accessible controls, mobile layouts and invitation context. These are deterministic boundary tests, not proof of live email delivery, a real Google round trip or physical-device keyboard behavior. Release smoke testing with an explicitly authorized recipient/device remains necessary for those external boundaries.

Final local validation for this change passed 516 tests, application/node TypeScript checks, the production build and Android `assembleDebug`. Browser validation passed 35 authentication scenes (727 assertions) and 20 existing Menu scenes (1,790 assertions), with screenshots reviewed on mobile and desktop. The repository has no configured lint/formatter scripts; `git diff --check` passed. No real account, password or auth-email mutation was made, and physical Android/iOS testing was not performed.

References: [Supabase password sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [signup behavior](https://supabase.com/docs/reference/javascript/auth-signup), [password recovery](https://supabase.com/docs/guides/auth/passwords), [PKCE lifecycle](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [server rate limits](https://supabase.com/docs/guides/auth/rate-limits).
