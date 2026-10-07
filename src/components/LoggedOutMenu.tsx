import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FocusEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Check, CircleHelp, Crown, Globe2, Home, Leaf, Mail, Minus, Plus, ShieldCheck, Sprout, UserRound, UsersRound } from "lucide-react";
import type { PlantieLanguage } from "../lib/onboarding";
import { createTranslator } from "../lib/i18n";
import { loggedOutMenuCopy } from "../lib/loggedOutMenuCopy";
import { menuProductInfo } from "../lib/menuProductInfo";
import { useAppVersion } from "../hooks/useAppVersion";
import { AuthPanel } from "./AuthPanel";
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

export const LoggedOutMenu = ({ language, onLanguageChange, inviteInput, onInviteInputChange, onContinueInvite, isJoiningInvite, inviteStatus, inviteStatusClass, onAuthSuccess, initialSection = "account" }: LoggedOutMenuProps) => {
  const t = useMemo(() => createTranslator(language), [language]);
  const copy = loggedOutMenuCopy(language ?? "en");
  const version = useAppVersion();
  const id = useId();
  const menu = useRef<HTMLElement>(null);
  const accountHeader = useRef<HTMLButtonElement>(null);
  const [expandedSection, setExpandedSection] = useState<MenuSection | null>(initialSection);

  useEffect(() => {
    const viewport = window.visualViewport;
    const revealFocusedInput = () => {
      const input = document.activeElement;
      if (input instanceof HTMLInputElement && menu.current?.contains(input) && input.getClientRects().length) {
        input.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
      }
    };
    viewport?.addEventListener("resize", revealFocusedInput);
    return () => viewport?.removeEventListener("resize", revealFocusedInput);
  }, []);

  const toggleSection = (section: MenuSection) => setExpandedSection((current) => current === section ? null : section);
  const openAccount = () => {
    setExpandedSection("account");
    accountHeader.current?.focus();
    accountHeader.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
  };
  const revealInput = (event: FocusEvent<HTMLElement>) => {
    if (window.matchMedia("(max-width: 900px)").matches && event.target instanceof HTMLInputElement) {
      event.target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
    }
  };
  const header = (section: MenuSection, Icon: LucideIcon, title: string, description: string, premium = false) => <button
    ref={section === "account" ? accountHeader : undefined} className="menu-hub-section-header" type="button"
    id={`${id}-${section}-heading`} aria-expanded={expandedSection === section} aria-controls={`${id}-${section}-panel`} onClick={() => toggleSection(section)}>
    <span className={`menu-hub-section-icon${premium ? " is-premium" : ""}`}><Icon size={25} aria-hidden="true" /></span>
    <span className="menu-hub-section-title"><strong>{title}</strong><small>{description}</small></span>
    <span className="menu-hub-section-toggle" aria-hidden="true">{expandedSection === section ? <Minus size={18} /> : <Plus size={18} />}</span>
  </button>;
  const panel = (section: MenuSection) => ({ id: `${id}-${section}-panel`, hidden: expandedSection !== section, "aria-labelledby": `${id}-${section}-heading` });
  const free = menuProductInfo.limits.free;
  const householdIcons = [UsersRound, Crown, Home];
  const previewDate = new Date();
  const premiumBenefits = [copy.premiumPlants, copy.premiumScans, copy.premiumCare, copy.premiumQr, copy.premiumSharing(menuProductInfo.limits.premium.slots)];

  return <main className="app-shell menu-hub" ref={menu} onFocusCapture={revealInput}>
    <header className="menu-hub-hero">
      <div className="menu-hub-hero-copy"><p className="eyebrow">Plantie</p><h1>{t("menu.heading")}</h1><p>{copy.heroBody}</p></div>
      <div className="menu-hub-hero-garden"><MenuFoliage /><span><Leaf size={21} aria-hidden="true" />{copy.tagline}</span></div>
      <button className="menu-hub-auth-state" type="button" onClick={openAccount}><span><Leaf size={23} aria-hidden="true" /></span><span><strong>{copy.signedOutTitle}</strong><small>{copy.signedOutBody}</small></span><ArrowRight size={18} aria-hidden="true" /></button>
    </header>
    <div className="menu-hub-layout">
      <section className="menu-hub-section menu-hub-account" data-section="account" data-expanded={expandedSection === "account"}>
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
            <article className="menu-hub-sharing"><h3>{copy.sharingTitle}</h3><p>{copy.freeSharing(free.slots)}</p><p>{copy.premiumSharing(menuProductInfo.limits.premium.slots)}</p><small>{copy.occupiedSlotsBody}</small></article>
            <div className="menu-hub-invite"><h3><Mail size={18} aria-hidden="true" />{copy.inviteTitle}</h3><p>{copy.inviteExplanation}</p><form onSubmit={(event) => { event.preventDefault(); if (!isJoiningInvite) onContinueInvite(); }}>
              <label className="field" htmlFor={`${id}-invite`}><span>{copy.inviteInputLabel}</span><input id={`${id}-invite`} value={inviteInput} onChange={(event) => onInviteInputChange(event.target.value)} placeholder="#/join?invite=..." disabled={isJoiningInvite} /></label>
              <LoadingButton className="neutral-action" type="submit" isLoading={isJoiningInvite} loadingLabel={t("household.joining")}>{copy.inviteContinue}<ArrowRight size={16} aria-hidden="true" /></LoadingButton>
            </form>{inviteStatus ? <p className={inviteStatusClass} role="status">{inviteStatus}</p> : null}</div>
          </div>
        </section>
        <section className="menu-hub-section" data-section="subscription">
          {header("subscription", Crown, t("menu.subscription"), copy.subscriptionDescription, true)}
          <div className="menu-hub-section-body" {...panel("subscription")}>
            <p className="menu-hub-intro">{copy.subscriptionIntro}</p>
            <div className="menu-hub-plans">
              <article className="menu-hub-plan"><span className="menu-hub-plan-icon"><Leaf size={21} aria-hidden="true" /></span><h3>{t("pricing.free")}</h3><p>{copy.freePlanBody}</p><small>{[copy.freePlants(free.plants), copy.freeScans(free.scans), copy.freeQr(free.qr), copy.freeCareRefresh(free.careRefreshes)].join(" · ")}</small></article>
              <article className="menu-hub-plan is-premium"><span className="menu-hub-plan-icon"><Crown size={21} aria-hidden="true" /></span><h3>{t("pricing.monthly")}</h3><p>{copy.monthlyPlanBody}</p></article>
              <article className="menu-hub-plan is-premium"><span className="menu-hub-plan-icon"><Crown size={21} aria-hidden="true" /></span><h3>{t("pricing.yearly")}</h3><p>{copy.yearlyPlanBody}</p></article>
            </div>
            <article className="menu-hub-benefits"><h3>{copy.premiumBenefitsTitle}</h3><ul>{premiumBenefits.map((feature) => <li key={feature}><Check size={15} aria-hidden="true" />{feature}</li>)}</ul></article>
            <p className="menu-hub-muted">{copy.pricesAfterSignIn}</p>
          </div>
        </section>
        <section className="menu-hub-section" data-section="language">
          {header("language", Globe2, t("account.language"), copy.languageDescription)}
          <div className="menu-hub-section-body" {...panel("language")}><div className="menu-hub-language-grid">{menuProductInfo.languages.map((option) => <button key={option.code} type="button" aria-pressed={(language ?? "en") === option.code} onClick={() => onLanguageChange(option.code)}><strong>{option.nativeName}</strong><small>{option.label}</small>{(language ?? "en") === option.code ? <Check size={17} aria-hidden="true" /> : null}</button>)}</div><p className="menu-hub-muted">{copy.languageAiBody}</p><article className="menu-hub-language-preview"><span>{copy.languagePreviewLabel}</span><strong>{t("nav.plants")} · {t("nav.diagnose")} · {t("nav.menu")}</strong><time dateTime={previewDate.toISOString()}>{new Intl.DateTimeFormat(language ?? "en", { dateStyle: "long" }).format(previewDate)}</time></article></div>
        </section>
        <section className="menu-hub-section" data-section="support">
          {header("support", CircleHelp, copy.supportTitle, copy.supportDescription, true)}
          <div className="menu-hub-section-body" {...panel("support")}><div className="menu-hub-help-topics">{copy.supportTips.map((topic) => <article key={topic.title}><h4>{topic.title}</h4><p>{topic.body}</p></article>)}</div><div className="menu-hub-links"><a href={menuProductInfo.routes.support}><CircleHelp size={18} aria-hidden="true" />{t("account.support")}<ArrowRight size={16} aria-hidden="true" /></a></div><p className="menu-hub-muted">{copy.supportContactPending}</p></div>
        </section>
        <section className="menu-hub-section" data-section="about">
          {header("about", Sprout, copy.aboutTitle, copy.aboutDescription)}
          <div className="menu-hub-section-body" {...panel("about")}><p className="menu-hub-intro">{copy.aboutIntro}</p><ul className="menu-hub-about-features">{copy.aboutFeatures.map((feature) => <li key={feature}><Check size={17} aria-hidden="true" />{feature}</li>)}</ul><div className="menu-hub-version" role="status"><span>{copy.versionLabel}</span><strong>{version.loading ? copy.versionLoading : version.error ? copy.versionUnavailable : version.version}</strong></div><p className="menu-hub-privacy"><ShieldCheck size={17} aria-hidden="true" />{copy.privacySummary}</p><div className="menu-hub-links"><a href={menuProductInfo.routes.privacy}>{t("account.privacy")}<ArrowRight size={16} aria-hidden="true" /></a><a href={menuProductInfo.routes.terms}>{t("account.terms")}<ArrowRight size={16} aria-hidden="true" /></a><a href={menuProductInfo.routes.subscriptionTerms}>{copy.subscriptionTermsLabel}<ArrowRight size={16} aria-hidden="true" /></a></div></div>
        </section>
      </div>
    </div>
  </main>;
};
