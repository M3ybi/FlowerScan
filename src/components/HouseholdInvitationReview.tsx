import { useId, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { CalendarDays, CheckCircle2, Home, Leaf, Mail, ShieldCheck, UsersRound } from "lucide-react";
import { resolveInvitationReviewState } from "../lib/householdInvitationRules";
import { householdInvitationCopy } from "../lib/householdInvitationCopy";
import type { Household, HouseholdInvitation } from "../lib/plantieRepository";
import type { PlantieLanguage } from "../lib/onboarding";
import { formatLocalizedTimestampDate } from "../app/appFormatting";
import { AuthPanel } from "./AuthPanel";
import { LoadingButton } from "./LoadingButton";

export type HouseholdInvitationReviewProps = {
  invitation: HouseholdInvitation | null;
  user: User | null;
  language: PlantieLanguage | null;
  loading: boolean;
  error: boolean;
  accepting: boolean;
  declining: boolean;
  acceptedHousehold?: Pick<Household, "id" | "name"> | null;
  actionError?: string;
  onAccept: (invitation: HouseholdInvitation) => void;
  onDecline: (invitation: HouseholdInvitation) => void;
  onUseAnotherAccount: () => void;
  onCancel: () => void;
  onStay: () => void;
  onSwitch: (householdId: string) => void;
  onRetry: () => void;
};

export const HouseholdInvitationReview = ({ invitation, user, language, loading, error, accepting, declining, acceptedHousehold, actionError, onAccept, onDecline, onUseAnotherAccount, onCancel, onStay, onSwitch, onRetry }: HouseholdInvitationReviewProps) => {
  const copy = householdInvitationCopy(language);
  const reviewTitleId = useId();
  const joinedTitleId = useId();
  const [confirmDecline, setConfirmDecline] = useState(false);
  const state = resolveInvitationReviewState(invitation, user);
  const busy = accepting || declining;
  const terminal = state === "invalid" || state === "expired" || state === "revoked" || state === "declined" || state === "unavailable" || state === "accepted";

  if (acceptedHousehold) return <section className="household-invitation-review invitation-joined" aria-labelledby={joinedTitleId}>
    <span className="invitation-status-icon"><CheckCircle2 size={28} aria-hidden="true" /></span>
    <h2 id={joinedTitleId}>{copy.acceptedTitle(acceptedHousehold.name)}</h2>
    <p className="invitation-joined-notice" role="status">{copy.acceptedNotice}</p>
    <div className="invitation-actions">
      <button className="neutral-action" type="button" onClick={onStay}>{copy.stay}</button>
      <button className="primary-action" type="button" onClick={() => onSwitch(acceptedHousehold.id)}><Home size={18} aria-hidden="true" />{copy.switchTo(acceptedHousehold.name)}</button>
    </div>
  </section>;

  if (loading) return <section className="household-invitation-review" aria-busy="true"><p role="status">{copy.loading}</p></section>;
  if (error) return <section className="household-invitation-review">
    <p role="alert">{copy.loadFailed}</p>
    {actionError ? <p className="report-status" role="alert">{actionError}</p> : null}
    <div className="invitation-actions">
      {user ? <button className="primary-action" type="button" onClick={onUseAnotherAccount}>{copy.useAnotherAccount}</button> : null}
      <button className="neutral-action" type="button" onClick={onRetry}>{copy.retry}</button>
      <button className="neutral-action" type="button" onClick={onCancel}>{copy.cancel}</button>
    </div>
  </section>;
  if (terminal) return <section className="household-invitation-review"><p role="status">{state === "accepted" && invitation?.isMember ? copy.alreadyMember(invitation.householdName) : copy.terminal[state]}</p><button className="neutral-action" type="button" onClick={onCancel}>{copy.cancel}</button></section>;
  if (!invitation) return null;
  if (state === "wrong-account") return <section className="household-invitation-review">
    <h2>{copy.title(invitation.householdName)}</h2>
    <p role="alert">{copy.wrongAccount(invitation.invitedEmail, user?.email ?? "")}</p>
    {actionError ? <p className="report-status" role="alert">{actionError}</p> : null}
    <div className="invitation-actions"><button className="primary-action" type="button" onClick={onUseAnotherAccount}>{copy.useAnotherAccount}</button><button className="neutral-action" type="button" onClick={onCancel}>{copy.cancel}</button></div>
  </section>;
  if (state === "verification-required") return <section className="household-invitation-review">
    <h2>{copy.title(invitation.householdName)}</h2><p role="status">{copy.verifyEmail}</p>
    <button className="neutral-action" type="button" onClick={onRetry}>{copy.retry}</button>
  </section>;
  if (state === "already-member") return <section className="household-invitation-review">
    <p role="status">{copy.alreadyMember(invitation.householdName)}</p>
    <div className="invitation-actions"><button className="neutral-action" type="button" onClick={onStay}>{copy.stay}</button><button className="primary-action" type="button" onClick={() => onSwitch(invitation.householdId)}>{copy.switchTo(invitation.householdName)}</button></div>
  </section>;

  return <section className="household-invitation-review" aria-labelledby={reviewTitleId} aria-busy={busy}>
    <header className="invitation-review-heading"><span className="invitation-status-icon"><Mail size={25} aria-hidden="true" /></span><div><h2 id={reviewTitleId}>{copy.title(invitation.householdName)}</h2><p>{copy.details}</p></div></header>
    <div className="invitation-review-metadata">
      <span><UsersRound size={18} aria-hidden="true" /><span><small>{copy.members}</small><strong>{invitation.activeMemberCount} / {invitation.maxSlots}</strong></span></span>
      <span><CalendarDays size={18} aria-hidden="true" /><span><small>{copy.expires}</small><strong>{formatLocalizedTimestampDate(invitation.expiresAt, language)}</strong></span></span>
      {invitation.inviterEmail ? <span><Mail size={18} aria-hidden="true" /><span><small>{copy.invitedBy}</small><strong>{invitation.inviterEmail}</strong></span></span> : null}
    </div>
    <ul className="invitation-benefits">{copy.plantBenefits.map((benefit) => <li key={benefit}><Leaf size={17} aria-hidden="true" />{benefit}</li>)}</ul>
    <div className="invitation-existing-household-note"><ShieldCheck size={22} aria-hidden="true" /><p>{copy.existingHouseholdNotice(invitation.householdName)}</p></div>
    {state === "auth-required" ? <div className="invitation-auth">
      <p>{copy.authPrompt(invitation.invitedEmail)}</p>
      <AuthPanel key={invitation.id} initialEmail={invitation.invitedEmail} invitationId={invitation.id} language={language} />
      <p className="auth-security-note">{copy.reviewAfterAuth}</p>
    </div> : <>
      {actionError ? <p className="report-status" role="alert">{actionError}</p> : null}
      {confirmDecline ? <div className="invitation-decline-confirmation" role="group" aria-label={copy.decline}>
        <p>{copy.declineConfirm(invitation.householdName)}</p>
        <div className="invitation-actions"><button className="neutral-action" type="button" disabled={busy} onClick={() => setConfirmDecline(false)}>{copy.keepInvitation}</button><LoadingButton className="danger-action" type="button" disabled={busy} isLoading={declining} loadingLabel={copy.declining} onClick={() => onDecline(invitation)}>{copy.decline}</LoadingButton></div>
      </div> : <div className="invitation-actions">
        <LoadingButton className="primary-action" type="button" disabled={busy} isLoading={accepting} loadingLabel={copy.accepting} onClick={() => onAccept(invitation)}>{copy.accept}</LoadingButton>
        <button className="neutral-action" type="button" disabled={busy} onClick={() => setConfirmDecline(true)}>{copy.decline}</button>
      </div>}
    </>}
  </section>;
};
