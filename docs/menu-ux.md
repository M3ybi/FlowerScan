# Plantie Menu UX

Plantie uses a production menu tab for account, household, QR, subscription, language, and support settings.

## Navigation

Bottom navigation:

- Plants
- Diagnose
- QR
- Menu

The old `#/account` route is treated as a compatibility alias for `#/menu`.

## Menu Sections

- Account: sign in/create account when logged out; email/provider, sign out, and delete account when logged in.
- Household / Family: current household, member summary, pending invites, and email invite creation.
- QR Labels: links to QR label tools and PDF export.
- Subscription: Premium status and mobile billing entry points.
- Language: app language selector.
- Support & Legal: privacy, terms, support, subscription terms, and release health.

## Removed From Production UI

- Guest mode.
- Legacy household import.
- "Import current Plantie household to cloud account".
- Data source/debug cards.
- Supabase read/write mode controls.
- Legacy-vs-Supabase comparison button.
- Local Supabase write rollback toggle.
- Manual household join form outside a valid invite link.

The legacy migration and fallback code may remain for internal rollback or developer migration tasks, but it is not exposed in the production menu.

## Household Invites

Family sharing is presented as email invites:

1. An Owner enters a family member email, including recipients without a Plantie account.
2. Plantie creates a one-time Supabase invite token through authenticated RPC.
3. Plantie stores the normalized invitee email with the hashed invite token and blocks duplicate active invites for the same email.
4. The invitation reserves a slot for seven days. An Owner can retry email or recover the same link without creating another reservation.
5. The invited user signs in or registers and verifies the invited email, then explicitly accepts or declines the invitation review. Verified recipients can also open it from the global mail inbox.
6. Membership is created atomically server-side. Existing households remain unchanged and selected; the new household becomes available in the household switcher.

Email delivery uses the authenticated `send-household-invite-email` Edge Function and verified Resend sender. Delivery failure preserves the invitation and reservation so the Owner can retry or copy the link. Account verification uses the signed Auth hook described in `auth-email-hook.md`.

## Account Deletion

The public delete-account legal route can describe the deletion process for store review, but the request form is only rendered when a user is authenticated. Production deletion remains a reviewed backend flow and never deletes data directly from the frontend.
