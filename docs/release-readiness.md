# Plantie release readiness

This checklist prepares Plantie for beta and store review without enabling real App Store or Google Play products.

## Public compliance pages

- `#/privacy`
- `#/terms`
- `#/support`
- `#/delete-account`
- `#/subscription-terms`
- `#/release-readiness`
- `#/health`

## Google Play requirements

- Complete Google Play identity verification.
- Prepare Data safety answers for account data, email/password authentication through Supabase Auth, Google OAuth, plant photos, AI diagnosis images, household sharing, email reports, purchases, and diagnostics.
- Prepare app access instructions for reviewers.
- Upload feature graphic, app icon, phone screenshots, and tablet screenshots if tablet support remains enabled.
- Configure subscription products only after identity verification and production readiness are complete.

## App Store requirements

- Purchase and configure Apple Developer Program membership.
- Prepare privacy nutrition labels for account data, photos, user content, purchases, diagnostics, and identifiers.
- Add review notes explaining that purchases are not active until App Store products are configured.
- Keep Apple Sign-In marked as coming soon until Apple Developer Program setup is complete. If Google remains enabled in the App Store build, Apple Sign-In must be configured before review.
- Upload 1024x1024 icon, screenshots, support URL, privacy URL, and subscription terms URL.

## Subscription checklist

- Keep web purchases disabled.
- Keep RevenueCat API keys in Vite env only for native runtime.
- Configure `premium` entitlement in RevenueCat.
- Configure `plantie_premium_monthly` and `plantie_premium_yearly` later in App Store Connect and Google Play Console.
- Confirm webhook env vars in Netlify before any real purchase testing.

## Supabase checklist

- Apply core schema migrations.
- Apply private image storage bucket migration.
- Confirm RLS for households, plants, diagnostics, entitlements, and storage.
- Confirm no service role key is exposed to frontend code.

## Netlify env checklist

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `REVENUECAT_WEBHOOK_SECRET`
- `OPENAI_API_KEY`
- `RESEND_API_KEY` if email reports are enabled
- Public Vite variables for Supabase and native RevenueCat keys

## Remaining blockers before beta

- Google Play identity verification.
- Apple Developer Program enrollment.
- Real store product configuration.
- Real device QA for camera, gallery, auth, Supabase storage, diagnosis, and QR flows.
- Final legal review of policy and terms text.
