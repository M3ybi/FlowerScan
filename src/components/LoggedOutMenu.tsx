import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, ArrowRight, Check, CircleHelp, Crown, Globe2, Home, Info, Leaf, Mail, Minus, Plus, ShieldCheck, Sprout, UserRound, UserRoundPlus, UsersRound } from "lucide-react";
import type { PlantieLanguage } from "../lib/onboarding";
import { createTranslator } from "../lib/i18n";
import { loggedOutMenuCopy } from "../lib/loggedOutMenuCopy";
import { menuProductInfo } from "../lib/menuProductInfo";
import { useAppVersion } from "../hooks/useAppVersion";
import { AuthPanel } from "./AuthPanel";
import { AppTabNav, MobileBottomNav } from "./AppNavigation";
import { LoadingButton } from "./LoadingButton";

type MenuSection = "account" | "household" | "subscription" | "language" | "support" | "about";
export type LoggedOutMenuProps = {
  language: PlantieLanguage | null;
  onLanguageChange: (language: PlantieLanguage) => void;
  inviteInput: string;
  onInviteInputChange: (value: string) => void;
  onContinueInvite: () => void;
  isJoiningInvite: boolean;
  inviteStatus: string;
  inviteStatusClass: string;
  onAuthSuccess: () => void;
  onAddPlant: () => void;
  initialSection?: "account" | "household";
};

// Decorative, code-native foliage keeps the hero light without adding image requests.
const MenuFoliage = () => <svg className="menu-hub-foliage" viewBox="0 0 250 220" aria-hidden="true" focusable="false">
  <path d="M126 207C122 157 123 97 150 26M123 166C98 141 70 110 49 73M126 123C153 104 184 79 205 43" fill="none" stroke="#477951" strokeWidth="3" />
  <path d="M147 71C110 58 115 11 158 5C178 30 175 60 147 71Z" fill="#67945d" />
  <path d="M135 114C95 107 88 65 117 43C148 55 159 91 135 114Z" fill="#3f7850" />
  <path d="M131 145C141 98 188 88 211 113C194 147 158 166 131 145Z" fill="#94ad70" />
  <path d="M104 149C67 157 38 126 45 97C82 91 109 113 104 149Z" fill="#739d63" />
  <path d="M69 107C32 112 6 87 10 53C43 49 75 74 69 107Z" fill="#99b778" />
  <path d="M173 91C167 55 196 19 229 21C239 59 209 93 173 91Z" fill="#4f8955" />
  <path d="M119 188C90 168 67 163 44 179C55 210 97 222 119 188Z" fill="#a3bb82" />
  <path d="M127 181C151 152 194 157 205 179C186 210 150 211 127 181Z" fill="#5e905b" />
</svg>;

export const LoggedOutMenu = ({ language, onLanguageChange, inviteInput, onInviteInputChange, onContinueInvite, isJoiningInvite, inviteStatus, inviteStatusClass, onAuthSuccess, onAddPlant, initialSection = "account" }: LoggedOutMenuProps) => {
  const t = useMemo(() => createTranslator(language), [language]);
  const copy = loggedOutMenuCopy(language ?? "en");
  const version = useAppVersion();
  const id = useId();
  const accountHeader = useRef<HTMLButtonElement>(null);
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches);
  const [openSections, setOpenSections] = useState<Set<MenuSection>>(() => new Set(compact ? [initialSection] : ["account", "household"]));

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => {
      setCompact(media.matches);
      if (media.matches) setOpenSections((current) => {
        const sections = Array.from(current);
        return new Set([sections[sections.length - 1] ?? "account"]);
      });
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const toggleSection = (section: MenuSection) => setOpenSections((current) => {
    if (current.has(section)) return new Set(Array.from(current).filter((value) => value !== section));
    return compact ? new Set([section]) : new Set([...current, section]);
  });
  const openAccount = () => {
    setOpenSections((current) => compact ? new Set(["account"]) : new Set([...current, "account"]));
    accountHeader.current?.focus();
    accountHeader.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
  };
  const header = (section: MenuSection, Icon: LucideIcon, title: string, description: string, premium = false) => <button
    ref={section === "account" ? accountHeader : undefined} className="menu-hub-section-header" type="button"
    id={`${id}-${section}-heading`} aria-expanded={openSections.has(section)} aria-controls={`${id}-${section}-panel`} onClick={() => toggleSection(section)}>
    <span className={`menu-hub-section-icon${premium ? " is-premium" : ""}`}><Icon size={25} aria-hidden="true" /></span>
    <span className="menu-hub-section-title"><strong>{title}</strong><small>{description}</small></span>
    <span className="menu-hub-section-toggle" aria-hidden="true">{openSections.has(section) ? <Minus size={18} /> : <Plus size={18} />}</span>
  </button>;
  const panel = (section: MenuSection) => ({ id: `${id}-${section}-panel`, hidden: !openSections.has(section), "aria-labelledby": `${id}-${section}-heading` });
  const free = menuProductInfo.limits.free;
  const householdIcons = [UsersRound, UserRoundPlus, Leaf, Home];
  const previewDate = new Date();

  return <main className="app-shell menu-hub">
    <header className="menu-hub-hero">
      <div className="menu-hub-hero-copy"><p className="eyebrow">Plantie</p><div className="menu-hub-title-row"><a className="icon-link" href="#/" aria-label={t("nav.back")}><ArrowLeft size={21} aria-hidden="true" /></a><h1>{t("menu.heading")}</h1></div><p>{copy.heroBody}</p></div>
      <div className="menu-hub-hero-garden"><MenuFoliage /><span><Leaf size={21} aria-hidden="true" />{copy.tagline}</span></div>
      <button className="menu-hub-auth-state" type="button" onClick={openAccount}><span><Leaf size={23} aria-hidden="true" /></span><span><strong>{copy.signedOutTitle}</strong><small>{copy.signedOutBody}</small></span><ArrowRight size={18} aria-hidden="true" /></button>
    </header>
    <AppTabNav currentPage="menu" onAddPlant={onAddPlant} t={t} />
    <div className="menu-hub-layout">
      <section className="menu-hub-section menu-hub-account" data-section="account" data-expanded={openSections.has("account")}>
        {header("account", UserRound, t("menu.account"), copy.accountDescription)}
        <div className="menu-hub-section-body" {...panel("account")}><AuthPanel compact appearance="menu" language={language} onSuccess={onAuthSuccess} /></div>
      </section>
      <div className="menu-hub-information">
        <section className="menu-hub-section" data-section="household">
          {header("household", Home, t("menu.household"), copy.householdDescription)}
          <div className="menu-hub-section-body" {...panel("household")}>
            <p className="menu-hub-intro">{copy.householdIntro}</p>
            <div className="menu-hub-features">{copy.householdFeatures.map((feature, index) => {
              const Icon = householdIcons[index];
              return <article key={feature.title}><span><Icon size={22} aria-hidden="true" /></span><h3>{feature.title}</h3><p>{feature.body}</p></article>;
            })}</div>
            <div className="menu-hub-role-grid"><article><h3><Crown size={17} aria-hidden="true" />{copy.ownerTitle}</h3><p>{copy.ownerBody}</p></article><article><h3><Leaf size={17} aria-hidden="true" />{copy.viewerTitle}</h3><p>{copy.viewerBody}</p></article></div>
            <article className="menu-hub-sharing"><h3>{copy.sharingTitle}</h3><p>{copy.freeSharing(free.slots)}</p><p>{copy.premiumSharing(menuProductInfo.limits.premium.slots)}</p><small>{copy.occupiedSlotsBody}</small></article>
            <aside className="menu-hub-notice"><Info size={20} aria-hidden="true" /><p>{copy.multiHouseholdBody}</p></aside>
            <div className="menu-hub-invite"><h3><Mail size={18} aria-hidden="true" />{t("household.inviteTitle")}</h3><p>{copy.inviteExplanation}</p><form onSubmit={(event) => { event.preventDefault(); onContinueInvite(); }}>
              <label className="field" htmlFor={`${id}-invite`}><span>{copy.inviteInputLabel}</span><input id={`${id}-invite`} value={inviteInput} onChange={(event) => onInviteInputChange(event.target.value)} placeholder="#/join?invite=..." disabled={isJoiningInvite} /></label>
              <LoadingButton className="neutral-action" type="submit" isLoading={isJoiningInvite} loadingLabel={t("household.joining")}>{t("household.continueWithInvite")}<ArrowRight size={16} aria-hidden="true" /></LoadingButton>
            </form>{inviteStatus ? <p className={inviteStatusClass} role="status">{inviteStatus}</p> : null}</div>
          </div>
        </section>
        <section className="menu-hub-section" data-section="subscription">
          {header("subscription", Crown, t("menu.subscription"), copy.subscriptionDescription, true)}
          <div className="menu-hub-section-body" {...panel("subscription")}>
            <p className="menu-hub-intro">{copy.subscriptionIntro}</p>
            <div className="menu-hub-plans">
              <article className="menu-hub-plan"><span className="menu-hub-plan-icon"><Leaf size={22} aria-hidden="true" /></span><h3>{t("pricing.free")}</h3><p>{copy.freePlanBody}</p><ul>{[copy.freePlants(free.plants), copy.freeScans(free.scans), copy.freeQr(free.qr), copy.freeCareRefresh(free.careRefreshes), copy.freeSharing(free.slots)].map((feature) => <li key={feature}><Check size={15} aria-hidden="true" />{feature}</li>)}</ul></article>
              <article className="menu-hub-plan is-premium"><span className="menu-hub-plan-icon"><Crown size={22} aria-hidden="true" /></span><h3>{t("pricing.monthly")} / {t("pricing.yearly")}</h3><p>{copy.premiumPlanBody}</p><ul>{[copy.premiumPlants, copy.premiumScans, copy.premiumQr, copy.premiumCare, copy.premiumSharing(menuProductInfo.limits.premium.slots)].map((feature) => <li key={feature}><Check size={15} aria-hidden="true" />{feature}</li>)}</ul><small>{copy.pricesAfterSignIn}</small></article>
            </div>
            <aside className="menu-hub-notice"><Crown size={20} aria-hidden="true" /><p>{copy.ownerBillingBody} {copy.cancellationBody}</p></aside>
            <article className="menu-hub-sharing"><h3>{copy.historyTitle}</h3><p>{copy.historyBody}</p></article>
          </div>
        </section>
        <section className="menu-hub-section" data-section="language">
          {header("language", Globe2, t("account.language"), copy.languageDescription)}
          <div className="menu-hub-section-body" {...panel("language")}><p className="menu-hub-intro">{copy.languageBody}</p><div className="menu-hub-language-grid">{menuProductInfo.languages.map((option) => <button key={option.code} type="button" aria-pressed={(language ?? "en") === option.code} onClick={() => onLanguageChange(option.code)}><strong>{option.nativeName}</strong><small>{option.label}</small>{(language ?? "en") === option.code ? <Check size={17} aria-hidden="true" /> : null}</button>)}</div><article className="menu-hub-language-preview"><span>{copy.languagePreviewLabel}</span><strong>{t("nav.plants")} · {t("nav.diagnose")} · {t("nav.menu")}</strong><time dateTime={previewDate.toISOString()}>{new Intl.DateTimeFormat(language ?? "en", { dateStyle: "long" }).format(previewDate)}</time></article></div>
        </section>
        <section className="menu-hub-section" data-section="support">
          {header("support", CircleHelp, copy.supportTitle, copy.supportDescription, true)}
          <div className="menu-hub-section-body" {...panel("support")}><p className="menu-hub-intro">{copy.supportBody}</p><div className="menu-hub-links"><a href={menuProductInfo.routes.support}><CircleHelp size={18} aria-hidden="true" />{t("account.support")}<ArrowRight size={16} aria-hidden="true" /></a></div><p className="menu-hub-muted">{copy.supportContactPending}</p><h3>{copy.troubleshootingTitle}</h3><div className="menu-hub-help-topics">{copy.supportTips.map((topic) => <article key={topic.title}><h4>{topic.title}</h4><p>{topic.body}</p></article>)}</div></div>
        </section>
        <section className="menu-hub-section" data-section="about">
          {header("about", Sprout, copy.aboutTitle, copy.aboutDescription)}
          <div className="menu-hub-section-body" {...panel("about")}><p className="menu-hub-intro">{copy.aboutIntro}</p><ul className="menu-hub-about-features">{copy.aboutFeatures.map((feature) => <li key={feature}><Check size={17} aria-hidden="true" />{feature}</li>)}</ul><div className="menu-hub-version" role="status"><span>{copy.versionLabel}</span><strong>{version.loading ? copy.versionLoading : version.error ? copy.versionUnavailable : version.version}</strong></div><aside className="menu-hub-notice"><ShieldCheck size={20} aria-hidden="true" /><p>{copy.privacySummary}</p></aside><div className="menu-hub-links"><a href={menuProductInfo.routes.privacy}>{t("account.privacy")}<ArrowRight size={16} aria-hidden="true" /></a><a href={menuProductInfo.routes.terms}>{t("account.terms")}<ArrowRight size={16} aria-hidden="true" /></a><a href={menuProductInfo.routes.subscriptionTerms}>{copy.subscriptionTermsLabel}<ArrowRight size={16} aria-hidden="true" /></a></div></div>
        </section>
      </div>
    </div>
    <MobileBottomNav currentPage="menu" onAddPlant={onAddPlant} t={t} />
  </main>;
};
