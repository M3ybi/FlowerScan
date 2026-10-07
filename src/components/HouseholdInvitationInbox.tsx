import { type RefObject, useId } from "react";
import { AlertCircle, CalendarDays, ChevronRight, Home, Mail, MailCheck, UsersRound, X } from "lucide-react";
import type { HouseholdInvitation } from "../lib/plantieRepository";
import type { PlantieLanguage } from "../lib/onboarding";
import { isActionableHouseholdInvitation } from "../lib/householdInvitationRules";
import { householdInvitationCopy } from "../lib/householdInvitationCopy";
import { formatLocalizedTimestampDate } from "../app/appFormatting";

export const InvitationInboxButton = ({ count, loading, expanded, language, onClick, buttonRef }: {
  count: number; loading: boolean; expanded: boolean; language: PlantieLanguage | null; onClick: () => void;
  buttonRef?: RefObject<HTMLButtonElement>;
}) => {
  const copy = householdInvitationCopy(language);
  const pendingCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return <button ref={buttonRef} className={`invitation-inbox-trigger${pendingCount ? " has-invitations" : ""}`} type="button" aria-label={pendingCount ? copy.pendingCount(pendingCount) : copy.inboxTitle} aria-expanded={expanded} aria-haspopup="dialog" aria-controls="household-invitation-center" aria-busy={loading} onClick={onClick}>
    <Mail size={21} aria-hidden="true" />
    {pendingCount > 0 ? <span className="invitation-inbox-badge" aria-hidden="true">{pendingCount > 9 ? "9+" : pendingCount}</span> : null}
  </button>;
};

export const HouseholdInvitationInbox = ({ invitations, loading, error, language, onView, onClose, onRetry }: {
  invitations: readonly HouseholdInvitation[]; loading: boolean; error: boolean; language: PlantieLanguage | null;
  onView: (invitation: HouseholdInvitation) => void; onClose: () => void; onRetry: () => void;
}) => {
  const copy = householdInvitationCopy(language);
  const titleId = useId();
  const actionable = invitations.filter((invitation) => isActionableHouseholdInvitation(invitation));
  return <section className="household-invitation-inbox" aria-labelledby={titleId} aria-busy={loading}>
    <header>
      <span className="invitation-status-icon"><Mail size={23} aria-hidden="true" /></span>
      <div className="invitation-inbox-heading"><h2 id={titleId}>{copy.inboxTitle}</h2><p>{copy.inboxSubtitle}</p></div>
      <button className="invitation-inbox-close" type="button" aria-label={copy.close} onClick={onClose}><X size={19} aria-hidden="true" /></button>
    </header>
    {error ? <div className="invitation-inbox-error" role="alert">
      <span className="invitation-inbox-state-icon"><AlertCircle size={25} aria-hidden="true" /></span>
      <p>{copy.loadFailed}</p><button className="neutral-action" type="button" onClick={onRetry}>{copy.retry}</button>
    </div> : loading && !actionable.length ? <div className="invitation-inbox-loading" role="status" aria-label={copy.loading}>
      {[0, 1].map((row) => <div className="invitation-inbox-skeleton" key={row} aria-hidden="true"><span /><span /><span /></div>)}
    </div> : !actionable.length ? <div className="invitation-inbox-empty" role="status">
      <span className="invitation-inbox-state-icon"><MailCheck size={30} aria-hidden="true" /></span>
      <h3>{copy.inboxEmpty}</h3><p>{copy.inboxEmptyHint}</p>
    </div> : <div className="invitation-inbox-rows">{actionable.map((invitation) => <article className="invitation-inbox-row" key={invitation.id}>
      <div className="invitation-inbox-card-heading"><span className="invitation-inbox-household-icon"><Home size={19} aria-hidden="true" /></span><h3>{invitation.householdName}</h3><span className="invitation-inbox-pending">{copy.pending}</span></div>
      {invitation.inviterEmail ? <p className="invitation-inbox-inviter">{copy.invitedBy} <strong>{invitation.inviterEmail}</strong></p> : null}
      <div className="invitation-inbox-metadata"><span className="invitation-inbox-role"><UsersRound size={15} aria-hidden="true" />{copy.viewer}</span><span className="invitation-inbox-expiry"><CalendarDays size={15} aria-hidden="true" />{copy.expires} {formatLocalizedTimestampDate(invitation.expiresAt, language)}</span></div>
      <button className="neutral-action invitation-inbox-view" type="button" onClick={() => onView(invitation)}>{copy.viewInvite}<ChevronRight size={17} aria-hidden="true" /></button>
    </article>)}</div>}
    <footer className="invitation-inbox-footer"><button className="neutral-action" type="button" onClick={onClose}>{copy.close}</button></footer>
  </section>;
};
