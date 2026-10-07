import { CalendarDays, ChevronRight, Mail, X } from "lucide-react";
import type { HouseholdInvitation } from "../lib/plantieRepository";
import type { PlantieLanguage } from "../lib/onboarding";
import { isActionableHouseholdInvitation } from "../lib/householdInvitationRules";
import { householdInvitationCopy } from "../lib/householdInvitationCopy";
import { formatLocalizedTimestampDate } from "../app/appFormatting";

export const InvitationInboxButton = ({ count, loading, expanded, language, onClick }: {
  count: number; loading: boolean; expanded: boolean; language: PlantieLanguage | null; onClick: () => void;
}) => <button className="invitation-inbox-trigger" type="button" aria-label={`${householdInvitationCopy(language).inboxTitle}${count > 0 ? ` (${count})` : ""}`} aria-expanded={expanded} aria-busy={loading} onClick={onClick}>
  <Mail size={21} aria-hidden="true" />{count > 0 ? <span className="invitation-inbox-badge" aria-hidden="true">{count}</span> : null}
</button>;

export const HouseholdInvitationInbox = ({ invitations, loading, error, language, onView, onClose, onRetry }: {
  invitations: readonly HouseholdInvitation[]; loading: boolean; error: boolean; language: PlantieLanguage | null;
  onView: (invitation: HouseholdInvitation) => void; onClose: () => void; onRetry: () => void;
}) => {
  const copy = householdInvitationCopy(language);
  const actionable = invitations.filter((invitation) => isActionableHouseholdInvitation(invitation));
  return <section className="household-invitation-inbox" aria-labelledby="invitation-inbox-title" aria-busy={loading}>
    <header><span className="invitation-status-icon"><Mail size={23} aria-hidden="true" /></span><h2 id="invitation-inbox-title">{copy.inboxTitle}</h2><button className="invitation-inbox-close" type="button" aria-label={copy.cancel} onClick={onClose}><X size={19} aria-hidden="true" /></button></header>
    {error ? <p role="alert">{copy.loadFailed} <button className="text-action" type="button" onClick={onRetry}>{copy.retry}</button></p> : null}
    {loading && !actionable.length ? <p role="status">{copy.loading}</p> : null}
    {!loading && !error && !actionable.length ? <p>{copy.inboxEmpty}</p> : null}
    <div className="invitation-inbox-rows">{actionable.map((invitation) => <article className="invitation-inbox-row" key={invitation.id}>
      <div><h3>{invitation.householdName}</h3>{invitation.inviterEmail ? <p>{copy.invitedBy} {invitation.inviterEmail}</p> : null}<small>{copy.viewer}</small><span className="invitation-inbox-expiry"><CalendarDays size={15} aria-hidden="true" />{copy.expires} {formatLocalizedTimestampDate(invitation.expiresAt, language)}</span></div>
      <button className="neutral-action" type="button" onClick={() => onView(invitation)}>{copy.viewInvite}<ChevronRight size={17} aria-hidden="true" /></button>
    </article>)}</div>
  </section>;
};
