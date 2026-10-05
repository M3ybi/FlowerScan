# Native authentication callbacks

Plantie's Capacitor application ID and URL scheme are `com.plantie.app`. Android registers three exact `VIEW` intent filters in `AndroidManifest.xml`; iOS registers the same scheme in `Info.plist`. `src/lib/nativeOAuth.ts` accepts only host `auth` and the paths below. Do not change the scheme without updating both native projects and the Supabase allow-list.

| Flow | Supabase redirect destination |
| --- | --- |
| Google OAuth and magic link | `com.plantie.app://auth/callback` |
| Email sign-up confirmation | `com.plantie.app://auth/confirm` |
| Password reset | `com.plantie.app://auth/recovery` |

Add **each exact URL** above in the linked Supabase project's **Authentication > URL Configuration > Redirect URLs**. The application's Google OAuth `redirectTo`, sign-up `emailRedirectTo`, and reset `redirectTo` must select the matching URL. Supabase's Site URL remains the production web URL; it is only a fallback when a request has no explicit redirect.

In **Authentication > Providers > Google**, copy the Supabase callback URL shown there into the Google Cloud OAuth client's authorized redirect URIs. That Google-to-Supabase URL is distinct from the Supabase-to-Plantie deep links above. Google OAuth opens with `skipBrowserRedirect: true` in Capacitor Browser. When the app receives the link, its single `appUrlOpen` listener exchanges the PKCE `code` with the same Supabase client that initiated the flow. At startup, it must also process `App.getLaunchUrl()` for links that launched a stopped app. The callback handler suppresses duplicate delivery of the same code from both sources. After a successful exchange, close the in-app browser where supported and let the shared auth listener update the session and UI.

The `/recovery` path is intentionally separate: Supabase's PKCE redirect may contain only `code`, so the app must recognize the intended screen from the path. The recovery screen must still require Supabase's `PASSWORD_RECOVERY` auth event after a successful exchange; a custom-scheme path alone does not prove that the code was issued for password reset. The `/confirm` path similarly identifies sign-up confirmation. Existing `/callback?type=recovery` or `type=signup` links are accepted for compatibility. Malformed, expired, or reused links must show a localized error and offer a new request; never display or log callback query values.

`capacitor.config.ts` sets `loggingBehavior: "none"` because Capacitor's debug bridge otherwise logs the complete `appUrlOpen` payload, including its one-time `code`, to Android Logcat. Keep this setting for both debug and release builds. Re-enable native logging only after ensuring auth callback payloads are redacted.

PKCE exchange requires the stored code verifier from the client that requested the email or started OAuth. Test email links on the same device and app installation that initiated the request. A cross-device password reset needs a separately designed token-hash verification flow; it cannot be assumed to work through this code-exchange route.

References: [Supabase mobile deep linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking), [Supabase PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow), and [Capacitor App URL events and launch URL](https://capacitorjs.com/docs/apis/app).

Native validation after a build and `npx cap sync`:

1. Start Google sign-in in the app; complete it in the browser; verify the app reopens and has a Supabase session.
2. Request password reset in the app; open the latest email on that device; verify the app opens the password form and updates the password.
3. Sign up with email confirmation enabled; open the confirmation email on that device; verify the app opens and restores the session.
4. Repeat with the app terminated before opening the email link to exercise `getLaunchUrl()`.
5. Reopen an already-used or expired link; verify that no second session exchange or misleading success is shown.
