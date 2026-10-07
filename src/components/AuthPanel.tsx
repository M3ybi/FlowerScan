import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import { Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
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
import { authPanelCopy, authPanelFieldErrors, authPanelKeyboardMode, authPanelProviders, authPanelTabModes, authPanelVisibleFieldErrors } from "../lib/authPanelCopy";
import type { AuthPanelField, AuthPanelFieldError, AuthPanelTabMode } from "../lib/authPanelCopy";

type AuthPanelProps = {
  compact?: boolean;
  initialMode?: AuthMode;
  language?: PlantieLanguage | null;
  onSuccess?: () => void;
  initialEmail?: string;
  invitationId?: string;
  appearance?: "menu";
};

const AuthField = ({ menu, label, inputId, icon: Icon, children, control, hint, hintId, error, errorId }: {
  menu: boolean; label: string; inputId: string; icon: LucideIcon; children: ReactNode;
  control?: ReactNode; hint?: string; hintId?: string; error?: string; errorId?: string;
}) => menu ? <div className={`field auth-menu-field${error ? " has-error" : ""}`}>
  <label className="auth-menu-field-label" htmlFor={inputId}>{label}</label>
  <div className="auth-input-wrap"><Icon className="auth-input-icon" size={18} aria-hidden="true" />{children}{control}</div>
  {hint ? <p className="auth-field-hint" id={hintId}>{hint}</p> : null}
  {error ? <p className="auth-field-error" id={errorId} aria-live="polite">{error}</p> : null}
</div> : <label className="field"><span>{label}</span>{children}</label>;

const modeLabels = { register: "auth.create", login: "auth.login", reset: "auth.reset" } as const;
const providerLabels = { google: "auth.google", apple: "auth.apple", amazon: "auth.amazon" } as const;
const providerTitles = { google: undefined, apple: "auth.appleSetupRequired", amazon: "auth.amazonNotConfigured" } as const;

export const AuthPanel = ({ compact = false, initialMode = "register", language = null, onSuccess, initialEmail = "", invitationId, appearance }: AuthPanelProps) => {
  const t = useMemo(() => createTranslator(language), [language]);
  const copy = authPanelCopy(language);
  // Recovery keeps its existing two-field confirmation flow and presentation.
  const menu = appearance === "menu" && initialMode !== "updatePassword";
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
  const [statusIsError, setStatusIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingAction, setPendingAction] = useState<"email" | "google" | null>(null);
  const [touched, setTouched] = useState<AuthPanelField[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const inputRefs = useRef<Partial<Record<AuthPanelField, HTMLInputElement | null>>>({});
  const submitting = useRef(false);
  const fieldErrors = authPanelFieldErrors({ mode, email, password, confirmPassword });
  const visibleErrors = menu ? authPanelVisibleFieldErrors(fieldErrors, touched, submitted) : {};
  const markTouched = (field: AuthPanelField) => setTouched((current) => current.includes(field) ? current : [...current, field]);
  const errorMessage = (code: AuthPanelFieldError | undefined) => code === "email_required" ? copy.emailRequired
    : code === "confirmation_required" ? copy.confirmationRequired : code ? t(`auth.error.${code}`) : undefined;
  const fieldErrorId = (field: AuthPanelField) => `${panelId}-${field}-error`;
  const fieldDescription = (field: AuthPanelField, hintId?: string) => menu
    ? [hintId, visibleErrors[field] ? fieldErrorId(field) : undefined].filter(Boolean).join(" ") || undefined : undefined;

  useEffect(() => {
    if (initialEmail) setEmail(initialEmail.trim().toLowerCase());
    if (!invitationId) return;
    try { rememberInvitationAuthContext(invitationId, window.localStorage); } catch { /* OAuth keeps its session return route. */ }
  }, [initialEmail, invitationId]);

  useEffect(() => {
    const handleNativeOAuthSuccess = () => {
      setIsSubmitting(false);
      setPendingAction(null);
      submitting.current = false;
      setStatus(t("auth.signedIn"));
      setStatusIsError(false);
      setPassword("");
      setConfirmPassword("");
      setTouched([]);
      setSubmitted(false);
      onSuccess?.();
    };
    const handleNativeOAuthError = () => {
      setIsSubmitting(false);
      setPendingAction(null);
      submitting.current = false;
      setStatus(t("auth.googleFailed"));
      setStatusIsError(true);
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
    setTouched([]);
    setSubmitted(false);
  };

  const selectMode = (nextMode: AuthPanelTabMode) => {
    setMode(nextMode);
    setStatus("");
    setStatusIsError(false);
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
    if (submitting.current || authUnavailable) return;

    if (menu) {
      setSubmitted(true);
      const invalidField = (["email", "password", "confirmation"] as const).find((field) => fieldErrors[field]);
      if (invalidField) {
        setStatus("");
        setStatusIsError(false);
        inputRefs.current[invalidField]?.focus();
        return;
      }
    }

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
      setStatusIsError(true);
      return;
    }

    try {
      submitting.current = true;
      setIsSubmitting(true);
      setPendingAction("email");
      setStatus("");
      setStatusIsError(false);
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
      setStatusIsError(true);
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
      setPendingAction(null);
    }
  };

  const startGoogle = async () => {
    if (submitting.current) return;
    let waitingForNativeCallback = false;
    try {
      submitting.current = true;
      setIsSubmitting(true);
      setPendingAction("google");
      setStatus("");
      setStatusIsError(false);
      await signInWithGoogle();
      waitingForNativeCallback = Capacitor.isNativePlatform();
    } catch (error) {
      setStatus(error instanceof AuthFlowError ? t(`auth.error.${error.code}`) : t("auth.googleFailed"));
      setStatusIsError(true);
    } finally {
      if (!waitingForNativeCallback) {
        submitting.current = false;
        setIsSubmitting(false);
        setPendingAction(null);
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
        noValidate={menu || undefined} aria-busy={menu && isSubmitting || undefined}
        role={menu && mode !== "updatePassword" ? "tabpanel" : undefined} aria-labelledby={menu && mode !== "updatePassword" ? `${panelId}-${mode}` : undefined}>
        {mode === "updatePassword" ? null : <AuthField menu={menu} label={t("auth.email")} inputId={`${panelId}-email`} icon={Mail}
          error={errorMessage(visibleErrors.email)} errorId={fieldErrorId("email")}>
          <input
            id={menu ? `${panelId}-email` : undefined}
            ref={(element) => { inputRefs.current.email = element; }}
            type="email"
            inputMode={menu ? "email" : undefined}
            value={email}
            placeholder={menu ? copy.emailPlaceholder : "you@example.com"}
            autoComplete="email"
            required={menu || undefined}
            disabled={menu && isSubmitting || undefined}
            aria-invalid={menu && visibleErrors.email ? true : undefined}
            aria-describedby={fieldDescription("email")}
            readOnly={Boolean(initialEmail && invitationId)}
            onChange={(event) => setEmail(event.target.value)}
            onBlur={menu ? () => markTouched("email") : undefined}
          />
        </AuthField>}
        {mode !== "reset" ? (
          <AuthField menu={menu} label={mode === "updatePassword" ? t("auth.newPassword") : t("auth.password")} inputId={`${panelId}-password`} icon={LockKeyhole}
            hint={menu && mode === "register" ? copy.passwordHint(minimumAuthPasswordLength) : undefined} hintId={`${panelId}-password-hint`}
            error={errorMessage(visibleErrors.password)} errorId={fieldErrorId("password")}
            control={<button className="auth-password-toggle" type="button" disabled={isSubmitting} aria-label={showPassword ? copy.hidePassword : copy.showPassword}
              aria-pressed={showPassword} aria-controls={`${panelId}-password`} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>}>
            <input
              id={menu ? `${panelId}-password` : undefined}
              ref={(element) => { inputRefs.current.password = element; }}
              type={menu && showPassword ? "text" : "password"}
              value={password}
              placeholder={menu ? mode === "register" ? copy.createPasswordPlaceholder : copy.passwordPlaceholder : undefined}
              minLength={minimumAuthPasswordLength}
              required={menu || undefined}
              disabled={menu && isSubmitting || undefined}
              aria-invalid={menu && visibleErrors.password ? true : undefined}
              aria-describedby={fieldDescription("password", mode === "register" ? `${panelId}-password-hint` : undefined)}
              autoComplete={mode === "register" || mode === "updatePassword" ? "new-password" : "current-password"}
              onChange={(event) => setPassword(event.target.value)}
              onBlur={menu ? () => markTouched("password") : undefined}
            />
          </AuthField>
        ) : null}
        {mode === "register" || mode === "updatePassword" ? (
          <AuthField menu={menu} label={t("auth.passwordConfirm")} inputId={`${panelId}-confirmation`} icon={LockKeyhole}
            error={errorMessage(visibleErrors.confirmation)} errorId={fieldErrorId("confirmation")}
            control={<button className="auth-password-toggle" type="button" disabled={isSubmitting} aria-label={showConfirmation ? copy.hideConfirmation : copy.showConfirmation}
              aria-pressed={showConfirmation} aria-controls={`${panelId}-confirmation`} onClick={() => setShowConfirmation((visible) => !visible)}>{showConfirmation ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>}>
            <input
              id={menu ? `${panelId}-confirmation` : undefined}
              ref={(element) => { inputRefs.current.confirmation = element; }}
              type={menu && showConfirmation ? "text" : "password"}
              value={confirmPassword}
              placeholder={menu ? copy.confirmationPlaceholder : undefined}
              minLength={minimumAuthPasswordLength}
              required={menu || undefined}
              disabled={menu && isSubmitting || undefined}
              aria-invalid={menu && visibleErrors.confirmation ? true : undefined}
              aria-describedby={fieldDescription("confirmation")}
              autoComplete="new-password"
              onChange={(event) => setConfirmPassword(event.target.value)}
              onBlur={menu ? () => markTouched("confirmation") : undefined}
            />
          </AuthField>
        ) : null}
        {menu && mode === "register" ? <p className="auth-verification-note">{copy.confirmationHint}</p> : null}
        <LoadingButton className="primary-action" type="submit" disabled={isSubmitting || authUnavailable}
          isLoading={menu ? isSubmitting && pendingAction === "email" : isSubmitting} loadingLabel={menu ? copy.loading[mode] : undefined}>
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
      {menu && status ? <div className={`report-status auth-form-status${statusIsError ? " is-error" : ""}`} role={statusIsError ? "alert" : "status"}>{status}</div> : null}

      {mode === "updatePassword" ? null : <>
        {menu ? <div className="auth-provider-divider"><span>{copy.providerDivider}</span></div> : null}
        <div className="auth-provider-list" role={menu ? "group" : undefined} aria-label={menu ? copy.providerLabel : "Sign-in providers"}>
          {authPanelProviders(menu ? isSupabaseConfigured : true).filter((provider) => !menu || provider.availability === "supported").map((provider) => menu ? <LoadingButton key={provider.id}
            className="neutral-action auth-google-button auth-provider-option" type="button" onClick={startGoogle}
            disabled={isSubmitting || !provider.enabled} isLoading={isSubmitting && pendingAction === "google"} loadingLabel={copy.googleLoading}>
            <ShieldCheck size={17} aria-hidden="true" />{t(providerLabels[provider.id])}
          </LoadingButton> : <button key={provider.id}
            className={`neutral-action${provider.id === "google" ? " auth-google-button" : ""}`}
            type="button" onClick={provider.id === "google" ? startGoogle : undefined} disabled={isSubmitting || !provider.enabled}
            title={providerTitles[provider.id] ? t(providerTitles[provider.id]!) : undefined}>
            {provider.id === "google" ? <ShieldCheck size={17} aria-hidden="true" /> : <KeyRound size={17} aria-hidden="true" />}
            {t(providerLabels[provider.id])}{provider.availability === "planned" ? <> <span>{t("auth.comingSoon")}</span></> : null}
          </button>)}
        </div>
      </>}

      <p className="auth-security-note">{menu ? <ShieldCheck size={16} aria-hidden="true" /> : null}{menu ? copy.security : t("auth.security")}</p>
      {!menu && status ? <div className="report-status" role="status">{status}</div> : null}
    </div>
  );
};
