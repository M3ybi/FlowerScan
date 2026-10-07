# Household invitations

Premium households have three occupied slots. Active members and actionable pending invitations each occupy one slot. Free households have one slot and cannot invite. Only Owners can create, resend, copy or revoke invitations; new members join as Viewers. `reconcile_household_access` revokes pending invitations when Premium ends. Accepting a valid invite creates the Viewer membership and marks the invite used in one database transaction.

The browser calls `create_household_invite` once per recipient, then passes only the invitation ID to `send-household-invite-email`. The Edge Function loads the active invitation through `get_household_invite_delivery`, which checks the signed-in Owner and Premium status. The database stores the token hash for validation and the new token encrypted in Supabase Vault so either Owner can resend the same link. The Edge Function constructs the URL and sends through Resend. It never trusts the recipient, household name, URL or token from the browser.

Set these **Supabase Edge Function secrets** before deploying:

```text
RESEND_API_KEY=<server-side Resend API key>
RESEND_FROM_EMAIL=Plantie <invites@your-verified-domain.example>
APP_PUBLIC_URL=https://your-production-site.example
```

The sender domain must be verified in Resend and permitted to send to arbitrary recipients. `onboarding@resend.dev` is intentionally rejected by the function because it is limited to test recipients. `APP_PUBLIC_URL` is the controlled site origin or base path; production requires HTTPS. Local development may use `http://localhost:5173`. The invite route is `#/join?invite=<token>`. Never put the provider key in `VITE_*` or browser code.

The hosted Plantie project uses `APP_PUBLIC_URL=https://plantiecare.com` and `RESEND_FROM_EMAIL=Plantie <invites@plantiecare.com>`. Keep the public URL aligned with the production web domain when changing domains. The sending domain was verified in Resend on 2026-10-07; this configuration does not by itself prove that an invitation email was delivered.

The function returns `{ invitationCreated: true, emailSent: true }` when Resend accepts the message, or `{ invitationCreated: true, emailSent: false, errorCode }` for a provider/configuration failure. A failed email leaves the pending invite and occupied slot intact. Owners can retry and copy from the pending row even when capacity is full; retry does not create another invite. Backend logs include invitation ID, household ID, provider status/category, recipient domain and timestamp, never a token or API key.

Invites created **before** `20261006113000_recoverable_household_invites.sql` have only a token hash. Their raw token cannot be recovered mathematically. If the original link is unavailable, the Owner must revoke that old pending invite and create a new one. Revocation frees its slot and invalidates the old link.

Deploy the migration before the Edge Function and web build. For troubleshooting, inspect Supabase Edge Function logs for `send-household-invite-email` and Resend → Emails/Logs. HTTP 502 from the older function only indicated that Resend rejected a request; it did not include the provider reason in logs. Confirm the actual sender/domain and recipient restriction in Resend before treating delivery as fixed.
