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

### Invitation Center

The global mailbox is a semantic button with a pending count capped visually at `9+`; its accessible label retains the actual count. It remains available with zero invitations and opens a meaningful empty state. Data comes from the existing verified-recipient RPC, refreshed after authentication, Menu entry, focus and mutations without polling.

Desktop inboxes open in a fixed, viewport-clamped popover anchored to the mailbox. Mobile uses a bottom sheet. Both are rendered in a body portal because the decorated header clips descendants with `overflow: hidden`. Opening the mailbox closes the household sheet. Outside pointer interaction and Escape dismiss the center, focus remains inside it while open and returns to the mailbox on close. Pending mutations block dismissal and repeated requests.

Viewing an inbox invitation opens its review in the same dialog without changing the current route. Email invitation links retain their existing `#/join` review and authentication behavior. Loading uses skeleton rows; empty and network-error states are distinct, with retry available. Details preserve the existing-home notice, Viewer permissions, decline confirmation and explicit Join action.

After backend confirmation, the invitation is removed from the list and badge immediately and any older inbox response is invalidated. The server-confirmed household is merged into the membership directory before refresh, so Switch remains available if the subsequent directory read fails. Success offers Stay or Switch without automatically selecting a household from the mailbox. Email-route and mailbox review results remain separate when both are mounted. Backend invitation records, capacity rules, tokens and email delivery are unchanged by this interface update.

Run `npm run test:household-invitation-recipient` for component and overlay regressions and `npm run test:menu-ux` for App wiring. The optional `npm run test:invitation-center-browser` mounts the production components, hook and stylesheet in an isolated headless Chromium fixture with mocked repository boundaries; screenshots and DOM results are written to `.tmp-tests/invitation-center-browser`. On Windows it discovers Edge; elsewhere set `PLANTIE_TEST_BROWSER` to an installed Chromium executable. These checks use programmatic DOM events and do not claim trusted keyboard input or an authenticated production/backend smoke test. Run them after `npm test`, which clears the temporary test directory.

## Account Deletion

The public delete-account legal route can describe the deletion process for store review, but the request form is only rendered when a user is authenticated. Production deletion remains a reviewed backend flow and never deletes data directly from the frontend.
