import {
  ArrowLeft,
  CircleHelp,
  Crown,
  Home,
  Languages,
  Mail,
  Pencil,
  Trash2,
  UserRound,
  UsersRound,
  X
} from "lucide-react";
import type { FormEvent, MouseEvent } from "react";
import {
  normalizeInviteTokenInput
} from "../../../app/householdInvites";
import type { HouseholdPersonItem } from "../../../app/householdPeople";
import type { AppRoute } from "../../../app/routes";
import { AppTabNav, MobileBottomNav } from "../../../components/AppNavigation";
import type { AuthNotice } from "../../../components/AuthPanel";
import { AuthPanel } from "../../../components/AuthPanel";
import { HouseholdPeopleList } from "../../../components/HouseholdPeopleList";
import { LoadingButton } from "../../../components/LoadingButton";
import { useMenuAccordion } from "../../../hooks/useMenuAccordion";
import type { MenuInformationSection } from "../../../hooks/useMenuAccordion";
import { LoggedOutMenu } from "../../../components/LoggedOutMenu";
import { PricingPage } from "../../../components/PricingPage";
import { SettingsSectionHeader } from "../../../components/SettingsSectionHeader";
import { useAuth } from "../../../hooks/useAuth";
import { useSubscriptionState } from "../../../hooks/useSubscriptionState";
import type { AuthMode } from "../../../lib/authRules";
import { isSupabaseBackend } from "../../../lib/backendConfig";
import { browserStorage } from "../../../lib/browserStorage.js";
import { householdInvitationCopy } from "../../../lib/householdInvitationCopy";
import type { HouseholdEntitlement } from "../../../lib/householdPlanService";
import { householdSubscriptionCopy } from "../../../lib/householdSubscriptionCopy";
import { createTranslator } from "../../../lib/i18n";
import { invitationReturnLocation, readInvitationAuthContext } from "../../../lib/invitationAuthContext";
import type { PlantieLanguage } from "../../../lib/onboarding";
import {
  supportedLanguages
} from "../../../lib/onboarding";
import type { HouseholdMember } from "../../../lib/plantieRepository";
import type { SubscriptionSnapshot } from "../../../lib/subscriptionState";
import type { SupabaseReadThroughState } from "../../../lib/supabaseReadThrough";
import type { HouseholdSession } from "../../../utils/household";

type Props = {
  route: AppRoute;
  auth: ReturnType<typeof useAuth>;
  authEntry: { id: number; mode: AuthMode; email: string; notice?: AuthNotice; } | null;
  selectedLanguage: PlantieLanguage | null;
  selectOnboardingLanguage: (language: PlantieLanguage) => void;
  joinInviteInput: string;
  setJoinInviteInput: React.Dispatch<React.SetStateAction<string>>;
  handleJoinInvite: (input?: string) => boolean;
  isJoiningInvite: boolean;
  inviteStatus: string;
  inviteStatusClass: string;
  setAuthEntry: React.Dispatch<React.SetStateAction<{ id: number; mode: AuthMode; email: string; notice?: AuthNotice; } | null>>;
  navigateBack: (fallbackHash?: string) => (event: MouseEvent<HTMLAnchorElement>) => void;
  t: ReturnType<typeof createTranslator>;
  renderHeroActions: () => JSX.Element;
  openAddPlantFromMobileNav: () => void;
  handleAccountSignOut: () => Promise<void>;
  isSigningOut: boolean;
  accountActionStatus: string;
  refreshHouseholdPeople: (showLoading?: boolean) => Promise<boolean>;
  activeHousehold: HouseholdSession | null;
  supabaseReadState: SupabaseReadThroughState | null;
  householdDisplayName: string;
  canRenameHousehold: boolean;
  householdNameEditSurface: ("sheet" | "menu") | null;
  startHouseholdNameEdit: (surface: ("sheet" | "menu")) => void;
  renderHouseholdNameEditor: (surface: ("sheet" | "menu"), headingId?: string, showTrigger?: boolean) => JSX.Element;
  householdEntitlement: HouseholdEntitlement | null;
  invitationCopy: ReturnType<typeof householdInvitationCopy>;
  usedHouseholdSlots: number;
  renderHouseholdSwitcher: () => JSX.Element | null;
  activeSupabaseHouseholdId: string;
  householdPeople: HouseholdPersonItem[];
  householdPeopleLoading: boolean;
  householdPeopleError: string;
  currentHouseholdMember: HouseholdMember | undefined;
  removingPersonKeys: Set<string>;
  canInviteToHousehold: boolean;
  isInvitePanelOpen: boolean;
  setIsInvitePanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleRemoveHouseholdPerson: (item: HouseholdPersonItem) => Promise<void>;
  handleRetryInviteEmail: (item: HouseholdPersonItem) => Promise<void>;
  handleCopyInviteLink: (item: HouseholdPersonItem) => Promise<void>;
  sendingInviteId: string | null;
  subscription: ReturnType<typeof useSubscriptionState>["subscription"];
  subscriptionCopy: ReturnType<typeof householdSubscriptionCopy>;
  isCreatingInvite: boolean;
  handleCreateInvite: () => Promise<void>;
  inviteEmail: string;
  setInviteEmail: React.Dispatch<React.SetStateAction<string>>;
  handleCreateHousehold: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
  householdNameDraft: string;
  setHouseholdNameDraft: React.Dispatch<React.SetStateAction<string>>;
  isCreatingHousehold: boolean;
  changeHousehold: () => void;
  householdNameEditStatus: string;
  inviteStatusTone: "error" | "info" | "success";
  householdNameEditStatusTone: "error" | "info" | "success";
  setInviteStatus: React.Dispatch<React.SetStateAction<string>>;
  setHouseholdNameEditStatus: React.Dispatch<React.SetStateAction<string>>;
  refreshSubscriptionState: () => Promise<SubscriptionSnapshot>;
  refreshPlanAfterSubscription: () => Promise<SubscriptionSnapshot>;
  renderHouseholdSheet: () => JSX.Element | null;
};

export const SettingsPage = ({
  route,
  auth,
  authEntry,
  selectedLanguage,
  selectOnboardingLanguage,
  joinInviteInput,
  setJoinInviteInput,
  handleJoinInvite,
  isJoiningInvite,
  inviteStatus,
  inviteStatusClass,
  setAuthEntry,
  navigateBack,
  t,
  renderHeroActions,
  openAddPlantFromMobileNav,
  handleAccountSignOut,
  isSigningOut,
  accountActionStatus,
  refreshHouseholdPeople,
  activeHousehold,
  supabaseReadState,
  householdDisplayName,
  canRenameHousehold,
  householdNameEditSurface,
  startHouseholdNameEdit,
  renderHouseholdNameEditor,
  householdEntitlement,
  invitationCopy,
  usedHouseholdSlots,
  renderHouseholdSwitcher,
  activeSupabaseHouseholdId,
  householdPeople,
  householdPeopleLoading,
  householdPeopleError,
  currentHouseholdMember,
  removingPersonKeys,
  canInviteToHousehold,
  isInvitePanelOpen,
  setIsInvitePanelOpen,
  handleRemoveHouseholdPerson,
  handleRetryInviteEmail,
  handleCopyInviteLink,
  sendingInviteId,
  subscription,
  subscriptionCopy,
  isCreatingInvite,
  handleCreateInvite,
  inviteEmail,
  setInviteEmail,
  handleCreateHousehold,
  householdNameDraft,
  setHouseholdNameDraft,
  isCreatingHousehold,
  changeHousehold,
  householdNameEditStatus,
  inviteStatusTone,
  householdNameEditStatusTone,
  setInviteStatus,
  setHouseholdNameEditStatus,
  refreshSubscriptionState,
  refreshPlanAfterSubscription,
  renderHouseholdSheet
}: Props) => {
  const { expandedSection, toggleSection } = useMenuAccordion(route.page === "menu" ? route.section : "", auth.isAuthenticated);
  const toggleMenuSection = (event: MouseEvent<HTMLElement>, section: MenuInformationSection) => {
    event.preventDefault();
    toggleSection(section);
  };
  if (route.page === "menu") {

    if (!auth.isAuthenticated) {
      return <LoggedOutMenu
        key={authEntry?.id ?? "default-auth-entry"}
        language={selectedLanguage}
        onLanguageChange={selectOnboardingLanguage}
        inviteInput={joinInviteInput}
        onInviteInputChange={setJoinInviteInput}
        onContinueInvite={() => { void handleJoinInvite(); }}
        isJoiningInvite={isJoiningInvite}
        inviteStatus={inviteStatus}
        inviteStatusClass={inviteStatusClass}
        onAuthSuccess={() => {
          setAuthEntry(null);
          if (normalizeInviteTokenInput(joinInviteInput)) void handleJoinInvite(joinInviteInput);
          else {
            try {
              const invitationId = readInvitationAuthContext(browserStorage);
              if (invitationId) window.location.hash = invitationReturnLocation(invitationId).slice(1);
            } catch { /* Invitations remain available from the authenticated inbox. */ }
          }
        }}
        initialSection={route.section}
        initialAuthMode={authEntry?.mode}
        initialAuthEmail={authEntry?.email}
        initialAuthNotice={authEntry?.notice}
        onAuthNoticeConsumed={() => setAuthEntry((current) => current ? { ...current, notice: undefined } : current)}
      />;
    }

    return (
      <main className="app-shell compact">
        <header className="topbar topbar-with-actions">
          <a className="icon-link" href="#/" onClick={navigateBack("#/")} aria-label={t("nav.back")}>
            <ArrowLeft size={22} aria-hidden="true" />
          </a>
          <div>
            <p className="eyebrow">Plantie</p>
            <h1>{t("menu.heading")}</h1>
            <p className="topbar-copy">{t("menu.body")}</p>
          </div>
          {renderHeroActions()}
        </header>
        <AppTabNav currentPage="menu" onAddPlant={openAddPlantFromMobileNav} t={t} />
        <section className="menu-stack" aria-label="Plantie menu">
          <section className="menu-section menu-account-section" aria-labelledby="menu-account-heading">
            <h2 className="menu-account-header" id="menu-account-heading">
              <SettingsSectionHeader icon={UserRound} title={t("menu.account")} description={t("menu.accountDescription")} />
            </h2>
            {auth.isAuthenticated ? (
              <div className="menu-section-body">
                <div className="account-summary-list">
                  <div>
                    <span>{t("account.emailAddress")}</span>
                    <strong>{auth.user?.email ?? "—"}</strong>
                  </div>
                  <div>
                    <span>{t("account.authProvider")}</span>
                    <strong>{String(auth.user?.app_metadata?.provider ?? "email").replace(/^./, (letter) => letter.toUpperCase())}</strong>
                  </div>
                </div>
                <div className="menu-action-row">
                  <LoadingButton
                    className="neutral-action"
                    type="button"
                    onClick={() => void handleAccountSignOut()}
                    isLoading={isSigningOut}
                    loadingLabel={t("account.signingOut")}
                  >
                    {t("account.signOut")}
                  </LoadingButton>
                </div>
                <div className="account-danger-zone"><a className="danger-action" href="#/delete-account"><Trash2 size={17} aria-hidden="true" />{t("account.delete")}</a></div>
                {accountActionStatus ? <p className="report-status">{accountActionStatus}</p> : null}
              </div>
            ) : (
              <div className="menu-section-body">
                <p>{t("account.loginRequiredBody")}</p>
                <AuthPanel compact language={selectedLanguage} />
              </div>
            )}
          </section>

          <details className="menu-section household-management" open={expandedSection === "household"} onToggle={(event) => {
            if (event.currentTarget.open) void refreshHouseholdPeople();
          }}>
            <summary onClick={(event) => toggleMenuSection(event, "household")}>
              <SettingsSectionHeader icon={Home} title={t("menu.household")} description={t("household.managementSubtitle")} />
            </summary>
            <div className="menu-section-body">
              {activeHousehold || supabaseReadState ? <>
                <div className="household-management-toolbar">
                  <span className="household-management-mobile-name">{householdDisplayName}</span>
                  {canRenameHousehold && householdNameEditSurface !== "menu" ? <button className="household-edit-button" type="button" onClick={() => startHouseholdNameEdit("menu")}>
                    <Pencil size={16} aria-hidden="true" />{t("household.editHousehold")}
                  </button> : null}
                </div>
                <div className={`household-overview-card ${householdNameEditSurface === "menu" ? "is-editing" : ""}`}>
                  <div className="household-overview-name"><span>{t("household.name")}</span>{renderHouseholdNameEditor("menu", undefined, false)}</div>
                  <div className="household-overview-metric"><UsersRound size={19} aria-hidden="true" /><span><small>{t("household.members")}</small><strong>{householdEntitlement?.activeMemberCount ?? t("household.loading")}</strong></span></div>
                  <div className="household-overview-metric"><Mail size={19} aria-hidden="true" /><span><small>{t("household.pendingInvites")}</small><strong>{householdEntitlement?.pendingInviteCount ?? t("household.loading")}</strong></span></div>
                  <div className="household-overview-metric"><UsersRound size={19} aria-hidden="true" /><span><small>{invitationCopy.occupiedSlots}</small><strong>{householdEntitlement ? `${usedHouseholdSlots} / ${householdEntitlement.maxMembers}` : t("household.loading")}</strong></span></div>
                </div>
              </> : null}
              {renderHouseholdSwitcher()}
              {activeSupabaseHouseholdId && auth.isAuthenticated ? (
                <>
                  <HouseholdPeopleList
                    key={activeSupabaseHouseholdId}
                    items={householdPeople}
                    loading={householdPeopleLoading}
                    error={householdPeopleError}
                    currentUserId={auth.user?.id ?? null}
                    currentRole={currentHouseholdMember?.role ?? null}
                    removingKeys={removingPersonKeys}
                    language={selectedLanguage}
                    t={t}
                    canInvite={canInviteToHousehold}
                    capacityLabel={householdEntitlement ? `${usedHouseholdSlots} / ${householdEntitlement.maxMembers}` : null}
                    inviteOpen={isInvitePanelOpen}
                    onInvite={() => setIsInvitePanelOpen((open) => !open)}
                    onRemove={(item) => void handleRemoveHouseholdPerson(item)}
                    onRetry={() => void refreshHouseholdPeople(true)}
                    onRetryInvite={(item) => void handleRetryInviteEmail(item)}
                    onCopyInvite={(item) => void handleCopyInviteLink(item)}
                    sendingInviteId={sendingInviteId}
                  />
                  {subscription.status === "ready" && !householdEntitlement?.isPremium ? <p className="household-sharing-note">{subscriptionCopy.sharingRequiresPremium}{householdEntitlement?.suspendedMemberCount ? ` ${subscriptionCopy.suspended(householdEntitlement.suspendedMemberCount)}` : ""}</p> : null}
                  {subscription.status === "ready" && householdEntitlement?.isPremium && usedHouseholdSlots >= householdEntitlement.maxMembers ? <p className="household-sharing-note">{subscriptionCopy.memberLimitReached}</p> : null}
                  {canInviteToHousehold && isInvitePanelOpen ? <section className="household-invite-panel" id="household-invite-panel" aria-labelledby="household-invite-title">
                    <div className="household-invite-panel-heading">
                      <div><h3 id="household-invite-title">{t("household.invitePanelTitle")}</h3><p>{t("household.invitePanelBody")}</p></div>
                      <button type="button" className="household-invite-close" onClick={() => setIsInvitePanelOpen(false)} aria-label={t("household.inviteClose")} disabled={isCreatingInvite}><X size={18} aria-hidden="true" /></button>
                    </div>
                    <form className="household-invite-form" onSubmit={(event) => { event.preventDefault(); void handleCreateInvite(); }}>
                      <label className="field">
                        <span>{t("household.emailAddress")}</span>
                        <input
                          type="email"
                          value={inviteEmail}
                          placeholder="rodina@example.com"
                          onChange={(event) => setInviteEmail(event.target.value)}
                          disabled={isCreatingInvite}
                          autoFocus
                        />
                      </label>
                      <LoadingButton
                        className="primary-action household-invite-submit"
                        type="submit"
                        isLoading={isCreatingInvite}
                        loadingLabel={t("household.inviteSending")}
                      >
                        {t("household.sendInvitation")}
                      </LoadingButton>
                    </form>
                  </section> : null}
                </>
              ) : auth.isAuthenticated && isSupabaseBackend ? (
                <div className="menu-form-grid">
                  <p>{t("household.createFirstBody")}</p>
                  <form className="menu-form-grid" onSubmit={handleCreateHousehold}>
                    <label className="field">
                      <span>{t("household.name")}</span>
                      <input
                        type="text"
                        value={householdNameDraft}
                        onChange={(event) => setHouseholdNameDraft(event.target.value)}
                        placeholder="Petzvalova"
                      />
                    </label>
                    <LoadingButton className="primary-action" type="submit" isLoading={isCreatingHousehold} loadingLabel={t("household.creatingShort")}>
                      {t("household.create")}
                    </LoadingButton>
                  </form>
                  <label className="field">
                    <span>{t("household.inviteToken")}</span>
                    <input
                      value={joinInviteInput}
                      onChange={(event) => setJoinInviteInput(event.target.value)}
                      placeholder="#/join?invite=..."
                    />
                  </label>
                  <LoadingButton
                    className="neutral-action"
                    type="button"
                    onClick={() => void handleJoinInvite()}
                    isLoading={isJoiningInvite}
                    loadingLabel={t("household.joining")}
                  >
                    {t("household.join")}
                  </LoadingButton>
                </div>
              ) : (
                <p>{t("household.inviteRequiresSupabase")}</p>
              )}
              {auth.isAuthenticated && (activeHousehold || supabaseReadState) ? <button className="household-switch-action" type="button" onClick={changeHousehold}>
                <UsersRound size={16} aria-hidden="true" />{t("household.switchOrJoin")}
              </button> : null}
              {route.page === "menu" && (inviteStatus || householdNameEditStatus && householdNameEditSurface !== "menu") ? <div className={`household-toast household-toast-${inviteStatus ? inviteStatusTone : householdNameEditStatusTone}`} role={(inviteStatus ? inviteStatusTone : householdNameEditStatusTone) === "error" ? "alert" : "status"} aria-live="polite">
                <span>{inviteStatus || householdNameEditStatus}</span>
                <button type="button" onClick={() => { setInviteStatus(""); setHouseholdNameEditStatus(""); }} aria-label={t("household.toastDismiss")}><X size={16} aria-hidden="true" /></button>
              </div> : null}
            </div>
          </details>
          <details className="menu-section" open={expandedSection === "subscription"} onToggle={(event) => { if (event.currentTarget.open) void refreshSubscriptionState(); }}>
            <summary onClick={(event) => toggleMenuSection(event, "subscription")}>
              <SettingsSectionHeader icon={Crown} title={t("menu.subscription")} description={subscriptionCopy.subtitle} premium />
            </summary>
            <div className="menu-section-body">
              <PricingPage
                language={selectedLanguage}
                subscription={subscription}
                householdMemberCount={householdEntitlement?.activeMemberCount ?? 0}
                onSubscriptionChanged={refreshPlanAfterSubscription}
              />
            </div>
          </details>

          <details className="menu-section" open={expandedSection === "language"}>
            <summary onClick={(event) => toggleMenuSection(event, "language")}>
              <SettingsSectionHeader icon={Languages} title={t("menu.settings")} description={t("menu.settingsDescription")} />
            </summary>
            <div className="menu-section-body">
              <h3>{t("account.language")}</h3>
              <div className="onboarding-language-grid compact-language-grid">
                {supportedLanguages.map((language) => (
                  <button
                    type="button"
                    key={language.code}
                    className={selectedLanguage === language.code ? "selected-language" : ""}
                    onClick={() => selectOnboardingLanguage(language.code)}
                  >
                    <strong>{language.nativeName}</strong>
                    <span>{language.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </details>

          <details className="menu-section" open={expandedSection === "support"}>
            <summary onClick={(event) => toggleMenuSection(event, "support")}>
              <SettingsSectionHeader icon={CircleHelp} title={t("menu.supportLegal")} description={t("menu.supportDescription")} />
            </summary>
            <div className="menu-section-body">
              <div className="menu-link-grid">
                <a href="#/privacy">{t("account.privacy")}</a>
                <a href="#/terms">{t("account.terms")}</a>
                <a href="#/support">{t("account.support")}</a>
                <a href="#/subscription-terms">Subscription Terms</a>
                <a href="#/health">Release Health</a>
              </div>
            </div>
          </details>
        </section>
        {renderHouseholdSheet()}
        <MobileBottomNav currentPage="menu" onAddPlant={openAddPlantFromMobileNav} t={t} />
      </main>
    );
  }
  return null;
};
