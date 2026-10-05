import { CalendarDays, ChevronLeft, ChevronRight, Crown, Eye, LoaderCircle, Plus, UsersRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { HouseholdPersonItem } from "../app/householdPeople";
import { paginateHouseholdPeople } from "../app/householdPeople";
import { formatLocalizedTimestampDate } from "../app/appFormatting";
import type { PlantieLanguage } from "../lib/onboarding";
import type { HouseholdRole } from "../lib/plantieRepository";
import type { createTranslator } from "../lib/i18n";
import { householdSubscriptionCopy } from "../lib/householdSubscriptionCopy";
import { resolveHouseholdPermissions } from "../lib/householdPermissions";

type Props = {
  items: HouseholdPersonItem[];
  loading: boolean;
  error: string;
  currentUserId: string | null;
  currentRole: HouseholdRole | null;
  removingKeys: ReadonlySet<string>;
  language: PlantieLanguage | null;
  t: ReturnType<typeof createTranslator>;
  canInvite?: boolean;
  capacityLabel?: string | null;
  inviteOpen?: boolean;
  onInvite?: () => void;
  onRemove: (item: HouseholdPersonItem) => void;
  onRetry: () => void;
};

export const HouseholdPeopleList = ({ items, loading, error, currentUserId, currentRole, removingKeys, language, t, canInvite, capacityLabel, inviteOpen, onInvite, onRemove, onRetry }: Props) => {
  const [requestedPage, setRequestedPage] = useState(0);
  const { items: pageItems, page, totalPages } = paginateHouseholdPeople(items, requestedPage);

  useEffect(() => {
    if (page !== requestedPage) setRequestedPage(page);
  }, [page, requestedPage]);

  const canRemove = (item: HouseholdPersonItem) => resolveHouseholdPermissions(currentRole).canRemoveMembers &&
    (item.status === "pending" || item.role === "viewer" && item.userId !== currentUserId);
  const onlyCurrentUser = currentUserId !== null && items.length === 1 && items[0].status === "active" && items[0].userId === currentUserId;

  return (
    <section className="menu-invite-list" aria-label={t("household.peopleTitle")} aria-busy={loading}>
      <div className="menu-invite-heading">
        <h2>{t("household.peopleTitle")}</h2>
        {capacityLabel ? <span className="household-capacity">{capacityLabel}</span> : null}
        {canInvite ? <button className="household-invite-trigger" type="button" onClick={onInvite} aria-expanded={Boolean(inviteOpen)} aria-controls={inviteOpen ? "household-invite-panel" : undefined}>
          <Plus size={17} aria-hidden="true" />{t("household.inviteMemberAction")}
        </button> : null}
      </div>
      {loading && !items.length ? <div className="menu-invite-skeleton" aria-label={t("household.peopleLoading")}><span /><span /></div> : null}
      {!loading && !items.length && !error ? <div className="menu-invite-empty-state">
        <span className="menu-invite-empty-icon" aria-hidden="true"><UsersRound size={26} /></span>
        <strong>{t("household.peopleEmpty")}</strong>
        <p>{t("household.peopleEmptyBody")}</p>
        {canInvite ? <button className="household-invite-trigger" type="button" onClick={onInvite} aria-expanded={Boolean(inviteOpen)} aria-controls={inviteOpen ? "household-invite-panel" : undefined}><Plus size={16} aria-hidden="true" />{t("household.inviteMemberAction")}</button> : null}
      </div> : null}
      {error ? <p className="report-status" role="alert">{error} <button type="button" onClick={onRetry}>{t("household.peopleRetry")}</button></p> : null}
      {pageItems.length ? <div className="menu-invite-rows">
        {pageItems.map((item) => {
          const date = formatLocalizedTimestampDate(item.since, language);
          const removing = removingKeys.has(item.key);
          const isYou = currentUserId !== null && item.status === "active" && item.userId === currentUserId;
          const roleLabel = t(item.role === "owner" ? "household.roleOwner" : "household.roleViewer");
          const RoleIcon = item.role === "owner" ? Crown : Eye;
          const initial = item.email.charAt(0).toLocaleUpperCase();
          const avatarTone = (item.email.charCodeAt(0) || 0) % 5;
          return <div className="menu-invite-row" key={item.key}>
            <span className={`menu-invite-avatar menu-invite-avatar-${avatarTone}`} aria-hidden="true">{initial}</span>
            <div className="menu-invite-identity">
              <strong title={item.email}>{item.email}</strong>
              {isYou ? <span>{t("household.peopleYou")}</span> : null}
            </div>
            <span className={`menu-invite-status status-${item.status}`}>{item.status === "suspended_plan_limit" ? householdSubscriptionCopy(language).inactive : t(item.status === "active" ? "household.peopleActive" : "household.peoplePending")}</span>
            <span className={`menu-invite-role role-${item.role}`}><RoleIcon size={14} aria-hidden="true" />{roleLabel}</span>
            <span className="menu-invite-date"><CalendarDays size={16} aria-hidden="true" /><span>
              <small>{t(item.status === "pending" ? "household.peopleInvitedLabel" : "household.peopleMemberSinceLabel")}</small>
              <span>{date || "—"}</span>
            </span></span>
            {canRemove(item) ? <button
              className="menu-invite-remove"
              type="button"
              aria-label={t("household.peopleRemove", { email: item.email })}
              title={t("household.peopleRemove", { email: item.email })}
              aria-busy={removing}
              disabled={removing}
              onClick={() => onRemove(item)}
            >{removing ? <LoaderCircle className="menu-invite-spinner" size={18} aria-hidden="true" /> : <X size={18} aria-hidden="true" />}</button> : <span className="menu-invite-action-placeholder" aria-hidden="true" />}
          </div>;
        })}
      </div> : null}
      {onlyCurrentUser && !error && !loading ? <div className="menu-invite-only-you">
        <UsersRound size={20} aria-hidden="true" />
        <span><strong>{t("household.peopleOnlyYou")}</strong><small>{t("household.peopleEmptyBody")}</small></span>
      </div> : null}
      {totalPages > 1 ? <nav className="menu-invite-pagination" aria-label={t("household.peoplePages")}>
        <div>
          <button type="button" aria-label={t("household.peoplePrevious")} disabled={page === 0} onClick={() => setRequestedPage(page - 1)}><ChevronLeft size={18} aria-hidden="true" /></button>
          <span aria-live="polite">{page + 1} / {totalPages}</span>
          <button type="button" aria-label={t("household.peopleNext")} disabled={page === totalPages - 1} onClick={() => setRequestedPage(page + 1)}><ChevronRight size={18} aria-hidden="true" /></button>
        </div>
        <span>{t("household.peopleShown", { shown: pageItems.length, count: items.length })}</span>
      </nav> : null}
    </section>
  );
};
