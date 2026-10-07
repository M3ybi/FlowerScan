# Plantie Menu UX

Plantie uses a production Menu tab for account, household, subscription, language, and support settings. QR tools remain in the existing application navigation.

## Navigation

Bottom navigation:

- Plants
- Diagnose
- Add plant
- QR
- Menu

The old `#/account` route is treated as a compatibility alias for `#/menu`.

## Menu Sections

- Account: sign in/create account when logged out; email/provider, sign out, and delete account when logged in.
- Household / Family: current household, member summary, pending invites, and email invite creation.
- Subscription: Premium status and mobile billing entry points.
- Language: app language selector.
- Support & Legal: privacy, terms, support, subscription terms, and release health.

## Logged-out Menu

`LoggedOutMenu` presents six expandable sections in this order: Account, Household / Family, Subscription, Language, Help & Support, and About Plantie. Above 900 CSS pixels, Account and Household initially open in two columns; collapsing Account lets the information sections use the full width. At narrower widths, only one section opens at a time. Whole headers are semantic buttons with associated panels, visible focus, and expansion state. Hidden panels stay mounted so language and accordion changes preserve account input. Opening a real invitation still uses the existing invitation review and authentication routes.

The Menu opts into the `AuthPanel` presentation through `appearance="menu"`. Registration, sign-in, reset, Google authentication, and native callbacks retain the existing service handlers. Password confirmation and the eight-character minimum use the current validation rules. Auth tabs support arrow keys, Home, and End; password visibility controls have independent accessible labels. Google is enabled when Supabase is configured. Apple and Amazon remain visibly disabled planned options; missing auth configuration disables submission and shows an explanatory state.

Public facts come from `menuProductInfo`: canonical Free quotas, household limits, supported languages, legal destinations, and package version. `loggedOutMenuCopy` supplies complete copy for English, Slovak, German, French, and Spanish. The existing Free QR export gate and public explanation share `freeQrLabelLimit`; its behavior remains unchanged. Installed native versions use Capacitor App metadata and show an unavailable state on failure instead of substituting a web version.

There are no example members, households, current plans, transactions, or guessed prices. Billing product loading currently requires authentication, so this view explains Free and Premium Monthly/Yearly and directs users to sign in for provider prices. Standard Free households have one occupied slot and no invitations; Premium supports three slots, including active members and valid pending invitations. Active Viewers retain full plant-care permissions while Owners administer the household and billing. Joining another household preserves existing memberships. The existing authenticated Menu continues to show real household, invitation, subscription, and history data.

Language changes reuse the existing device preference handler and show actual navigation translations and a localized current date. Support links use existing routes; no support inbox, FAQ, live chat, bug-report system, or release history is invented. About links to the existing privacy, terms, and subscription-terms pages.

Run `npm run test:auth-panel-ui` and `npm run test:logged-out-menu-facts` for presentation, provider states, canonical facts, translations, destinations, and version behavior. Both are included in `npm test`. After the full suite, run `npm run test:logged-out-menu-browser` for isolated exact-width fixtures at 320, 390, 768, 1024, 1280, and 1600 CSS pixels. The runner exercises the production components and stylesheet with only auth/config boundaries substituted, including validation, pending/error states, accordion retention, language changes, overflow, and bottom-navigation clearance. Screenshots and DOM results are saved in `.tmp-tests/logged-out-menu-browser`. On Windows it discovers Edge; elsewhere set `PLANTIE_TEST_BROWSER` to an installed Chromium executable. These programmatic checks do not send signup/reset emails or complete live OAuth, and do not replace physical-device or trusted-input testing. This interface change requires no database migration or new environment variables.

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
