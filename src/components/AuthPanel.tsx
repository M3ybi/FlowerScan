import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import { Eye, EyeOff, KeyRound, Mail, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import {
  registerWithEmailPassword,
  requestPasswordReset,
  signInWithEmailPassword,
  signInWithGoogle,
  updatePassword,
} from "../lib/authService";
import {
  AuthFlowError,
  minimumAuthPasswordLength,
  validateLoginCode,
  validatePasswordResetCode,
  validatePasswordUpdateCode,
  validateRegistrationCode,
} from "../lib/authRules";
import type { AuthMode } from "../lib/authRules";
import { createTranslator } from "../lib/i18n";
import type { PlantieLanguage } from "../lib/onboarding";
import { nativeOAuthErrorEvent, nativeOAuthSuccessEvent } from "../lib/nativeOAuth";
import { LoadingButton } from "./LoadingButton";
import { rememberInvitationAuthContext } from "../lib/invitationAuthContext";
import { isSupabaseConfigured } from "../lib/supabase";
import { authPanelCopy, authPanelKeyboardMode, authPanelProviders, authPanelTabModes } from "../lib/authPanelCopy";
import type { AuthPanelTabMode } from "../lib/authPanelCopy";

type AuthPanelProps = {
  compact?: boolean;
  initialMode?: AuthMode;
  language?: PlantieLanguage | null;
  onSuccess?: () => void;
  initialEmail?: string;
  invitationId?: string;
  appearance?: "menu";
};

const AuthField = ({ menu, label, inputId, icon: Icon, children, control, hint, hintId }: {
  menu: boolean; label: string; inputId: string; icon: LucideIcon; children: ReactNode;
  control?: ReactNode; hint?: string; hintId?: string;
}) => menu ? <div className="field auth-menu-field">
  <label className="auth-menu-field-label" htmlFor={inputId}>{label}</label>
  <div className="auth-input-wrap"><Icon className="auth-input-icon" size={18} aria-hidden="true" />{children}{control}</div>
  {hint ? <p className="auth-field-hint" id={hintId}>{hint}</p> : null}
</div> : <label className="field"><span>{label}</span>{children}</label>;

const modeLabels = { register: "auth.create", login: "auth.login", reset: "auth.reset" } as const;
const providerLabels = { google: "auth.google", apple: "auth.apple", amazon: "auth.amazon" } as const;
const providerTitles = { google: undefined, apple: "auth.appleSetupRequired", amazon: "auth.amazonNotConfigured" } as const;

export const AuthPanel = ({ compact = false, initialMode = "register", language = null, onSuccess, initialEmail = "", invitationId, appearance }: AuthPanelProps) => {
  const t = useMemo(() => createTranslator(language), [language]);
  const copy = authPanelCopy(language);
  const menu = appearance === "menu";
  const authUnavailable = menu && !isSupabaseConfigured;
  const panelId = useId();
  const tabRefs = useRef<Record<AuthPanelTabMode, HTMLButtonElement | null>>({ register: null, login: null, reset: null });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState(initialEmail.trim().toLowerCase());
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    if (initialEmail) setEmail(initialEmail.trim().toLowerCase());
    if (!invitationId) return;
    try { rememberInvitationAuthContext(invitationId, window.localStorage); } catch { /* OAuth keeps its session return route. */ }
  }, [initialEmail, invitationId]);

  useEffect(() => {
    const handleNativeOAuthSuccess = () => {
      setIsSubmitting(false);
      submitting.current = false;
      setStatus(t("auth.signedIn"));
      setPassword("");
      setConfirmPassword("");
      onSuccess?.();
    };
    const handleNativeOAuthError = () => {
      setIsSubmitting(false);
      submitting.current = false;
      setStatus(t("auth.googleFailed"));
    };

    window.addEventListener(nativeOAuthSuccessEvent, handleNativeOAuthSuccess);
    window.addEventListener(nativeOAuthErrorEvent, handleNativeOAuthError);
    return () => {
      window.removeEventListener(nativeOAuthSuccessEvent, handleNativeOAuthSuccess);
      window.removeEventListener(nativeOAuthErrorEvent, handleNativeOAuthError);
    };
  }, [onSuccess, t]);

  const resetSensitiveFields = () => {
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmation(false);
  };

  const selectMode = (nextMode: AuthPanelTabMode) => {
    setMode(nextMode);
    setStatus("");
    resetSensitiveFields();
  };
  const handleTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const nextMode = authPanelKeyboardMode(mode, event.key);
    if (!nextMode || isSubmitting) return;
    event.preventDefault();
    selectMode(nextMode);
    tabRefs.current[nextMode]?.focus();
  };

  const submitEmailAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;

    const normalizedEmail = email.trim().toLowerCase();
    const validationError =
      mode === "register"
        ? validateRegistrationCode({ confirmPassword, email: normalizedEmail, password })
        : mode === "login"
          ? validateLoginCode({ email: normalizedEmail, password })
          : mode === "updatePassword"
            ? validatePasswordUpdateCode({ confirmPassword, password })
            : validatePasswordResetCode(normalizedEmail);

    if (validationError) {
      setStatus(t(`auth.error.${validationError}`));
      return;
    }

    try {
      submitting.current = true;
      setIsSubmitting(true);
      setStatus("");
      if (mode === "register") {
        await registerWithEmailPassword(normalizedEmail, password);
        setStatus(t("auth.accountCreated"));
      } else if (mode === "login") {
        await signInWithEmailPassword(normalizedEmail, password);
        setStatus(t("auth.signedIn"));
      } else if (mode === "updatePassword") {
        await updatePassword(password, confirmPassword);
        setStatus(t("auth.passwordUpdated"));
      } else {
        await requestPasswordReset(normalizedEmail);
        setStatus(t("auth.resetSent"));
      }
      resetSensitiveFields();
      if (mode === "login" || mode === "updatePassword") onSuccess?.();
    } catch (error) {
      setStatus(error instanceof AuthFlowError ? t(`auth.error.${error.code}`) : t("auth.failed"));
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  const startGoogle = async () => {
    if (submitting.current) return;
    let waitingForNativeCallback = false;
    try {
      submitting.current = true;
      setIsSubmitting(true);
      setStatus("");
      await signInWithGoogle();
      waitingForNativeCallback = Capacitor.isNativePlatform();
    } catch (error) {
      setStatus(error instanceof AuthFlowError ? t(`auth.error.${error.code}`) : t("auth.googleFailed"));
    } finally {
      if (!waitingForNativeCallback) {
        submitting.current = false;
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className={`${compact ? "auth-panel auth-panel-compact" : "auth-panel"}${menu ? " auth-panel-menu" : ""}`}>
      {mode === "updatePassword" ? null : (
        <div className="auth-mode-tabs" role="tablist" aria-label={t("auth.modeLabel")} onKeyDown={menu ? handleTabKey : undefined}>
          {authPanelTabModes.map((tabMode) => <button key={tabMode} type="button" disabled={isSubmitting} className={mode === tabMode ? "active" : ""}
            ref={(element) => { tabRefs.current[tabMode] = element; }}
            id={menu ? `${panelId}-${tabMode}` : undefined} role={menu ? "tab" : undefined}
            aria-selected={menu ? mode === tabMode : undefined} aria-controls={menu ? `${panelId}-form` : undefined}
            tabIndex={menu ? mode === tabMode ? 0 : -1 : undefined} onClick={() => selectMode(tabMode)}>
            {t(modeLabels[tabMode])}
          </button>)}
        </div>
      )}

      {authUnavailable ? <p className="auth-unavailable-note" role="status">{copy.unavailable}</p> : null}
      <form className="auth-form" onSubmit={submitEmailAuth} id={menu ? `${panelId}-form` : undefined}
        role={menu && mode !== "updatePassword" ? "tabpanel" : undefined} aria-labelledby={menu && mode !== "updatePassword" ? `${panelId}-${mode}` : undefined}>
        {mode === "updatePassword" ? null : <AuthField menu={menu} label={t("auth.email")} inputId={`${panelId}-email`} icon={Mail}>
          <input
            id={menu ? `${panelId}-email` : undefined}
            type="email"
            value={email}
            placeholder="you@example.com"
            autoComplete="email"
            readOnly={Boolean(initialEmail && invitationId)}
            onChange={(event) => setEmail(event.target.value)}
          />
        </AuthField>}
        {mode !== "reset" ? (
          <AuthField menu={menu} label={mode === "updatePassword" ? t("auth.newPassword") : t("auth.password")} inputId={`${panelId}-password`} icon={KeyRound}
            hint={menu && (mode === "register" || mode === "updatePassword") ? copy.passwordHint(minimumAuthPasswordLength) : undefined} hintId={`${panelId}-password-hint`}
            control={<button className="auth-password-toggle" type="button" disabled={isSubmitting} aria-label={showPassword ? copy.hidePassword : copy.showPassword}
              aria-pressed={showPassword} aria-controls={`${panelId}-password`} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>}>
            <input
              id={menu ? `${panelId}-password` : undefined}
              type={menu && showPassword ? "text" : "password"}
              value={password}
              minLength={minimumAuthPasswordLength}
              aria-describedby={menu && (mode === "register" || mode === "updatePassword") ? `${panelId}-password-hint` : undefined}
              autoComplete={mode === "register" || mode === "updatePassword" ? "new-password" : "current-password"}
              onChange={(event) => setPassword(event.target.value)}
            />
          </AuthField>
        ) : null}
        {mode === "register" || mode === "updatePassword" ? (
          <AuthField menu={menu} label={t("auth.passwordConfirm")} inputId={`${panelId}-confirmation`} icon={KeyRound}
            control={<button className="auth-password-toggle" type="button" disabled={isSubmitting} aria-label={showConfirmation ? copy.hideConfirmation : copy.showConfirmation}
              aria-pressed={showConfirmation} aria-controls={`${panelId}-confirmation`} onClick={() => setShowConfirmation((visible) => !visible)}>{showConfirmation ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>}>
            <input
              id={menu ? `${panelId}-confirmation` : undefined}
              type={menu && showConfirmation ? "text" : "password"}
              value={confirmPassword}
              minLength={minimumAuthPasswordLength}
              autoComplete="new-password"
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </AuthField>
        ) : null}
        {menu && mode === "register" ? <p className="auth-verification-note">{copy.confirmationHint}</p> : null}
        <LoadingButton className="primary-action" type="submit" disabled={isSubmitting || authUnavailable} isLoading={isSubmitting}>
          <Mail size={17} aria-hidden="true" />
          {mode === "register"
            ? t("auth.create")
            : mode === "login"
              ? t("auth.login")
              : mode === "updatePassword"
                ? t("auth.updatePassword")
                : t("auth.sendReset")}
        </LoadingButton>
      </form>

      {mode === "updatePassword" ? null : <>
        {menu ? <div className="auth-provider-divider"><span>{copy.providerDivider}</span></div> : null}
        <div className="auth-provider-list" role={menu ? "group" : undefined} aria-label={menu ? copy.providerLabel : "Sign-in providers"}>
          {authPanelProviders(menu ? isSupabaseConfigured : true).map((provider) => <button key={provider.id}
            className={`neutral-action${provider.id === "google" ? " auth-google-button" : ""}${menu ? ` auth-provider-option${provider.availability === "planned" ? " auth-provider-planned" : ""}` : ""}`}
            type="button" onClick={provider.id === "google" ? startGoogle : undefined} disabled={isSubmitting || !provider.enabled}
            title={providerTitles[provider.id] ? t(providerTitles[provider.id]!) : undefined}>
            {provider.id === "google" ? <ShieldCheck size={17} aria-hidden="true" /> : <KeyRound size={17} aria-hidden="true" />}
            {t(providerLabels[provider.id])}{provider.availability === "planned" ? <> <span>{t("auth.comingSoon")}</span></> : null}
          </button>)}
        </div>
      </>}

      <p className="auth-security-note">{menu ? <ShieldCheck size={16} aria-hidden="true" /> : null}{t("auth.security")}</p>
      {status ? <div className="report-status" role="status">{status}</div> : null}
    </div>
  );
};
