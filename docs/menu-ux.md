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

1. Owner/editor enters a family member email.
2. Plantie creates a one-time Supabase invite token through authenticated RPC.
3. Plantie stores the normalized invitee email with the hashed invite token and blocks duplicate active invites for the same email.
4. The raw invite link is shown once for copying.
5. The invited user signs in or registers, opens the invite link, and accepts or declines.
6. Membership is created server-side by Supabase RPC/RLS.

Current limitation: automated email delivery still requires a deployed email provider workflow. Until that is configured, the UI creates the email-bound invite and shows the copyable link without exposing provider internals.

## Account Deletion

The public delete-account legal route can describe the deletion process for store review, but the request form is only rendered when a user is authenticated. Production deletion remains a reviewed backend flow and never deletes data directly from the frontend.
