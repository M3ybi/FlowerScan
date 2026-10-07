import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode, Ref } from "react";
import { CircleAlert, CircleCheck, Eye, EyeOff, Info, KeyRound, LockKeyhole, Mail, ShieldCheck, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { finishPasswordRecovery, getPasswordResetRetryAt, registerWithEmailPassword, requestPasswordReset, signInWithEmailPassword, signInWithGoogle, updatePassword } from "../lib/authService";
import { AuthFlowError, minimumAuthPasswordLength, normalizeAuthEmail, passwordResetRemainingSeconds, resolveAuthFailure } from "../lib/authRules";
import type { AuthMode, AuthOperation } from "../lib/authRules";
import { createTranslator } from "../lib/i18n";
import type { PlantieLanguage } from "../lib/onboarding";
import { nativeOAuthErrorEvent, nativeOAuthSuccessEvent } from "../lib/nativeOAuth";
import { LoadingButton } from "./LoadingButton";
import { rememberInvitationAuthContext } from "../lib/invitationAuthContext";
import { isSupabaseConfigured } from "../lib/supabase";
import { authPanelCopy, authPanelFieldErrors, authPanelKeyboardMode, authPanelNoticeContent, authPanelProviders, authPanelTabModes, authPanelVisibleFieldErrors } from "../lib/authPanelCopy";
import type { AuthMessageSeverity, AuthNotice, AuthPanelField, AuthPanelFieldError, AuthPanelTabMode } from "../lib/authPanelCopy";

export type { AuthNotice } from "../lib/authPanelCopy";

type AuthPanelProps = {
  compact?: boolean; initialMode?: AuthMode; language?: PlantieLanguage | null; onSuccess?: () => void;
  initialEmail?: string; invitationId?: string; appearance?: "menu"; initialNotice?: AuthNotice | null;
  onNoticeConsumed?: () => void;
  onPasswordUpdated?: (email: string | null) => Promise<void> | void;
  onRequestPasswordReset?: (email: string) => Promise<void> | void;
};

const messageIcons = { success: CircleCheck, info: Info, warning: TriangleAlert, error: CircleAlert };
export const AuthMessage = ({ severity, title, children, actions, messageRef }: {
  severity: AuthMessageSeverity; title?: string; children: ReactNode; actions?: ReactNode; messageRef?: Ref<HTMLDivElement>;
}) => {
  const Icon = messageIcons[severity];
  return <div className={`report-status auth-form-status auth-message-${severity}${severity === "error" ? " is-error" : ""}`}
    role={severity === "error" ? "alert" : "status"} tabIndex={-1} ref={messageRef}>
    <Icon size={19} aria-hidden="true" />
    <div className="auth-message-content">{title ? <strong>{title}</strong> : null}<p>{children}</p>
      {actions ? <div className="auth-message-actions">{actions}</div> : null}
    </div>
  </div>;
};

const AuthField = ({ label, inputId, icon: Icon, children, control, hint, hintId, error, errorId }: {
  label: string; inputId: string; icon: LucideIcon; children: ReactNode;
  control?: ReactNode; hint?: string; hintId?: string; error?: string; errorId?: string;
}) => <div className={`field auth-menu-field${error ? " has-error" : ""}`}>
  <label className="auth-menu-field-label" htmlFor={inputId}>{label}</label>
  <div className="auth-input-wrap"><Icon className="auth-input-icon" size={18} aria-hidden="true" />{children}{control}</div>
  {hint ? <p className="auth-field-hint" id={hintId}>{hint}</p> : null}
  {error ? <p className="auth-field-error" id={errorId} aria-live="polite">{error}</p> : null}
</div>;

const modeLabels = { register: "auth.create", login: "auth.login", reset: "auth.reset" } as const;
const providerLabels = { google: "auth.google", apple: "auth.apple", amazon: "auth.amazon" } as const;
const providerTitles = { apple: "auth.appleSetupRequired", amazon: "auth.amazonNotConfigured" } as const;
const unusableRecoveryCodes = ["invalid_link", "session_expired", "reauthentication_required"];

export const AuthPanel = ({ compact = false, initialMode = "register", language = null, onSuccess, initialEmail = "", invitationId, appearance,
  initialNotice = null, onNoticeConsumed, onPasswordUpdated, onRequestPasswordReset }: AuthPanelProps) => {
  const t = useMemo(() => createTranslator(language), [language]);
  const copy = authPanelCopy(language);
  const menu = appearance === "menu";
  const authUnavailable = !isSupabaseConfigured;
  const panelId = useId();
  const tabRefs = useRef<Record<AuthPanelTabMode, HTMLButtonElement | null>>({ register: null, login: null, reset: null });
  const inputRefs = useRef<Partial<Record<AuthPanelField, HTMLInputElement | null>>>({});
  const messageRef = useRef<HTMLDivElement>(null);
  const focusTarget = useRef<AuthPanelField | "message" | null>(initialNotice ? "message" : null);
  const consumedNotice = useRef<AuthNotice | null>(null);
  const submitting = useRef(false);
  const nativeOAuthPending = useRef(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState(normalizeAuthEmail(initialEmail));
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notice, setNotice] = useState<AuthNotice | null>(initialNotice);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingAction, setPendingAction] = useState<"email" | "google" | "completion" | "newReset" | null>(null);
  const [touched, setTouched] = useState<AuthPanelField[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [resetRetryAt, setResetRetryAt] = useState(getPasswordResetRetryAt);
  const [now, setNow] = useState(Date.now);
  const [passwordCommitted, setPasswordCommitted] = useState(false);
  const [updatedEmail, setUpdatedEmail] = useState<string | null>(null);
  const [recoveryBlocked, setRecoveryBlocked] = useState(initialMode === "updatePassword" && Boolean(initialNotice && unusableRecoveryCodes.includes(initialNotice.key)));
  const resetSeconds = passwordResetRemainingSeconds(resetRetryAt, now);
  const recoveryUnavailable = mode === "updatePassword" && recoveryBlocked;
  const fieldErrors = authPanelFieldErrors({ mode, email, password, confirmPassword });
  const visibleErrors = authPanelVisibleFieldErrors(fieldErrors, touched, submitted);
  const markTouched = (field: AuthPanelField) => setTouched((current) => current.includes(field) ? current : [...current, field]);
  const errorMessage = (code: AuthPanelFieldError | undefined) => code === "email_required" ? copy.emailRequired
    : code === "confirmation_required" ? copy.confirmationRequired : code ? t(`auth.error.${code}`) : undefined;
  const fieldErrorId = (field: AuthPanelField) => `${panelId}-${field}-error`;
  const fieldDescription = (field: AuthPanelField, hintId?: string) =>
    [hintId, visibleErrors[field] ? fieldErrorId(field) : undefined].filter(Boolean).join(" ") || undefined;

  useEffect(() => {
    if (initialEmail) setEmail(normalizeAuthEmail(initialEmail));
    if (!invitationId) return;
    try { rememberInvitationAuthContext(invitationId, window.localStorage); } catch { /* OAuth keeps its session return route. */ }
  }, [initialEmail, invitationId]);

  useEffect(() => {
    if (!initialNotice || consumedNotice.current === initialNotice) return;
    consumedNotice.current = initialNotice;
    setNotice(initialNotice);
    if (mode === "updatePassword" && unusableRecoveryCodes.includes(initialNotice.key)) setRecoveryBlocked(true);
    focusTarget.current = "message";
    onNoticeConsumed?.();
  }, [initialNotice, mode, onNoticeConsumed]);

  useEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    focusTarget.current = null;
    if (target === "message") messageRef.current?.focus();
    else inputRefs.current[target]?.focus();
  }, [mode, notice]);

  useEffect(() => {
    setNow(Date.now());
    if (!passwordResetRemainingSeconds(resetRetryAt)) return;
    const interval = window.setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      if (!passwordResetRemainingSeconds(resetRetryAt, currentTime)) window.clearInterval(interval);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [resetRetryAt]);

  const resetSensitiveFields = () => {
    setPassword(""); setConfirmPassword(""); setShowPassword(false); setShowConfirmation(false); setTouched([]); setSubmitted(false);
  };
  const selectMode = (nextMode: AuthPanelTabMode, focusField = false) => {
    setEmail(normalizeAuthEmail(email)); setMode(nextMode); setNotice(null); resetSensitiveFields();
    if (nextMode === "reset") { setResetRetryAt(getPasswordResetRetryAt()); setNow(Date.now()); }
    if (focusField) focusTarget.current = nextMode === "reset" || !email.trim() ? "email" : "password";
  };
  const handleTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const nextMode = authPanelKeyboardMode(mode, event.key);
    if (!nextMode || isSubmitting) return;
    event.preventDefault(); selectMode(nextMode); tabRefs.current[nextMode]?.focus();
  };
  const showFailure = (error: unknown, operation: AuthOperation) => {
    const guidance = resolveAuthFailure(error, operation);
    if (guidance.nextMode) {
      setEmail(normalizeAuthEmail(email)); setMode(guidance.nextMode); resetSensitiveFields();
      focusTarget.current = email.trim() ? "password" : "email";
    } else {
      focusTarget.current = "message";
      if (operation === "updatePassword" && unusableRecoveryCodes.includes(guidance.code)) {
        setRecoveryBlocked(true);
        resetSensitiveFields();
      }
    }
    if (operation === "reset") {
      setResetRetryAt(error instanceof AuthFlowError && error.retryAt !== null ? error.retryAt : getPasswordResetRetryAt());
      setNow(Date.now());
    }
    setNotice({ key: guidance.code, severity: guidance.severity, actionModes: guidance.actionModes });
  };

  useEffect(() => {
    // Native OAuth must never complete or bypass a password-recovery session.
    if (mode === "updatePassword") return;
    const handleNativeOAuthSuccess = () => {
      if (!nativeOAuthPending.current) return;
      nativeOAuthPending.current = false;
      setIsSubmitting(false); setPendingAction(null); submitting.current = false; resetSensitiveFields();
      setNotice({ key: "signed_in", severity: "success" }); onSuccess?.();
    };
    const handleNativeOAuthError = () => {
      if (!nativeOAuthPending.current) return;
      nativeOAuthPending.current = false;
      setIsSubmitting(false); setPendingAction(null); submitting.current = false; focusTarget.current = "message";
      setNotice({ key: "oauth_failure", severity: "error" });
    };
    window.addEventListener(nativeOAuthSuccessEvent, handleNativeOAuthSuccess);
    window.addEventListener(nativeOAuthErrorEvent, handleNativeOAuthError);
    return () => {
      window.removeEventListener(nativeOAuthSuccessEvent, handleNativeOAuthSuccess);
      window.removeEventListener(nativeOAuthErrorEvent, handleNativeOAuthError);
    };
  }, [mode, onSuccess]);

  const completeRecovery = async (verifiedEmail: string | null) => {
    try {
      if (onPasswordUpdated) await onPasswordUpdated(verifiedEmail);
      else {
        // Standalone panels also close recovery before exposing normal sign-in.
        await finishPasswordRecovery();
        setMode("login");
        if (verifiedEmail) setEmail(verifiedEmail);
        setPasswordCommitted(false);
        setNotice({ key: "password_changed", severity: "success" });
        focusTarget.current = "message";
      }
    } catch {
      focusTarget.current = "message"; setNotice({ key: "recovery_cleanup_failed", severity: "warning" });
    }
  };
  const submitEmailAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current || authUnavailable || passwordCommitted || recoveryUnavailable) return;
    setSubmitted(true);
    const invalidField = (["email", "password", "confirmation"] as const).find((field) => fieldErrors[field]);
    if (invalidField) { setNotice(null); inputRefs.current[invalidField]?.focus(); return; }
    const normalizedEmail = normalizeAuthEmail(email); setEmail(normalizedEmail);
    try {
      submitting.current = true; setIsSubmitting(true); setPendingAction("email"); setNotice(null);
      if (mode === "register") {
        const outcome = await registerWithEmailPassword(normalizedEmail, password); resetSensitiveFields();
        setNotice({ key: outcome.status === "signed_in" ? "signed_in" : "verification_requested", severity: "success", actionModes: outcome.status === "signed_in" ? [] : ["login", "reset"] });
        if (outcome.status === "signed_in") onSuccess?.();
      } else if (mode === "login") {
        await signInWithEmailPassword(normalizedEmail, password); resetSensitiveFields(); setNotice({ key: "signed_in", severity: "success" }); onSuccess?.();
      } else if (mode === "updatePassword") {
        const outcome = await updatePassword(password, confirmPassword); resetSensitiveFields();
        setPasswordCommitted(true); setUpdatedEmail(outcome.email); setPendingAction("completion");
        setNotice({ key: "password_changed", severity: "info" }); await completeRecovery(outcome.email);
      } else {
        const outcome = await requestPasswordReset(normalizedEmail); resetSensitiveFields();
        setResetRetryAt(outcome.retryAt); setNow(Date.now()); setNotice({ key: "reset_requested", severity: "success", actionModes: ["login"] });
      }
      focusTarget.current = "message";
    } catch (error) { showFailure(error, mode); }
    finally { submitting.current = false; setIsSubmitting(false); setPendingAction(null); }
  };
  const finishRecovery = async () => {
    if (submitting.current || !passwordCommitted) return;
    submitting.current = true; setIsSubmitting(true); setPendingAction("completion");
    await completeRecovery(updatedEmail);
    submitting.current = false; setIsSubmitting(false); setPendingAction(null);
  };
  const requestNewReset = async () => {
    if (submitting.current) return;
    submitting.current = true; setIsSubmitting(true); setPendingAction("newReset");
    try {
      if (onRequestPasswordReset) await onRequestPasswordReset(normalizeAuthEmail(email));
      else {
        await finishPasswordRecovery();
        selectMode("reset", true);
      }
    } catch {
      // No password was changed; keep expired recovery blocked without claiming otherwise.
      showFailure(new AuthFlowError("unavailable"), "updatePassword");
    }
    finally { submitting.current = false; setIsSubmitting(false); setPendingAction(null); }
  };
  const startGoogle = async () => {
    if (submitting.current || authUnavailable || mode === "updatePassword") return;
    let waitingForNativeCallback = false;
    try {
      submitting.current = true; setIsSubmitting(true); setPendingAction("google"); setNotice(null);
      nativeOAuthPending.current = Capacitor.isNativePlatform();
      await signInWithGoogle(); waitingForNativeCallback = Capacitor.isNativePlatform();
    } catch (error) { showFailure(error, "google"); }
    finally { if (!waitingForNativeCallback) { nativeOAuthPending.current = false; submitting.current = false; setIsSubmitting(false); setPendingAction(null); } }
  };

  const noticeContent = notice ? authPanelNoticeContent(notice.key, language) : null;
  const actions = recoveryUnavailable ? <LoadingButton className="neutral-action" onClick={requestNewReset} disabled={isSubmitting}
    isLoading={pendingAction === "newReset"} loadingLabel={copy.loading.reset}>{copy.requestNewReset}</LoadingButton>
    : passwordCommitted ? <LoadingButton className="neutral-action auth-recovery-finish" onClick={finishRecovery} disabled={isSubmitting}
      isLoading={pendingAction === "completion"} loadingLabel={copy.finishingRecovery}>{copy.finishRecovery}</LoadingButton>
      : notice?.actionModes?.filter((action): action is AuthPanelTabMode => action !== "updatePassword").map((action) => <button
        className="neutral-action" type="button" key={action} disabled={isSubmitting} onClick={() => selectMode(action, true)}>{t(modeLabels[action])}</button>);

  return <div className={`${compact ? "auth-panel auth-panel-compact" : "auth-panel"}${menu ? " auth-panel-menu" : ""}`}>
    {mode === "updatePassword" ? null : <div className="auth-mode-tabs" role="tablist" aria-label={t("auth.modeLabel")} onKeyDown={handleTabKey}>
      {authPanelTabModes.map((tabMode) => <button key={tabMode} type="button" disabled={isSubmitting} className={mode === tabMode ? "active" : ""}
        ref={(element) => { tabRefs.current[tabMode] = element; }} id={`${panelId}-${tabMode}`} role="tab" aria-selected={mode === tabMode}
        aria-controls={`${panelId}-form`} tabIndex={mode === tabMode ? 0 : -1} onClick={() => selectMode(tabMode)}>{t(modeLabels[tabMode])}</button>)}
    </div>}
    {authUnavailable ? <p className="auth-unavailable-note" role="status">{copy.unavailable}</p> : null}
    {!passwordCommitted && !recoveryUnavailable ? <form className="auth-form" onSubmit={submitEmailAuth} id={`${panelId}-form`} noValidate aria-busy={isSubmitting || undefined}
      role={mode !== "updatePassword" ? "tabpanel" : undefined} aria-labelledby={mode !== "updatePassword" ? `${panelId}-${mode}` : undefined}>
      {mode === "updatePassword" ? null : <AuthField label={t("auth.email")} inputId={`${panelId}-email`} icon={Mail} error={errorMessage(visibleErrors.email)} errorId={fieldErrorId("email")}>
        <input id={`${panelId}-email`} ref={(element) => { inputRefs.current.email = element; }} type="email" inputMode="email" value={email} placeholder={copy.emailPlaceholder}
          autoComplete="email" required disabled={isSubmitting || authUnavailable} aria-invalid={visibleErrors.email ? true : undefined} aria-describedby={fieldDescription("email")}
          readOnly={Boolean(initialEmail && invitationId)} onChange={(event) => setEmail(event.target.value)} onBlur={() => markTouched("email")} />
      </AuthField>}
      {mode !== "reset" ? <AuthField label={mode === "updatePassword" ? t("auth.newPassword") : t("auth.password")} inputId={`${panelId}-password`} icon={LockKeyhole}
        hint={mode === "register" || mode === "updatePassword" ? copy.passwordHint(minimumAuthPasswordLength) : undefined} hintId={`${panelId}-password-hint`}
        error={errorMessage(visibleErrors.password)} errorId={fieldErrorId("password")}
        control={<button className="auth-password-toggle" type="button" disabled={isSubmitting || authUnavailable} aria-label={showPassword ? copy.hidePassword : copy.showPassword}
          aria-pressed={showPassword} aria-controls={`${panelId}-password`} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>}>
        <input id={`${panelId}-password`} ref={(element) => { inputRefs.current.password = element; }} type={showPassword ? "text" : "password"} value={password}
          placeholder={mode === "updatePassword" ? copy.newPasswordPlaceholder : mode === "register" ? copy.createPasswordPlaceholder : copy.passwordPlaceholder}
          minLength={mode === "login" ? undefined : minimumAuthPasswordLength} required disabled={isSubmitting || authUnavailable} aria-invalid={visibleErrors.password ? true : undefined}
          aria-describedby={fieldDescription("password", mode === "register" || mode === "updatePassword" ? `${panelId}-password-hint` : undefined)}
          autoComplete={mode === "register" || mode === "updatePassword" ? "new-password" : "current-password"} onChange={(event) => setPassword(event.target.value)} onBlur={() => markTouched("password")} />
      </AuthField> : null}
      {mode === "register" || mode === "updatePassword" ? <AuthField label={mode === "updatePassword" ? copy.confirmNewPassword : t("auth.passwordConfirm")} inputId={`${panelId}-confirmation`} icon={LockKeyhole}
        error={errorMessage(visibleErrors.confirmation)} errorId={fieldErrorId("confirmation")}
        control={<button className="auth-password-toggle" type="button" disabled={isSubmitting || authUnavailable} aria-label={showConfirmation ? copy.hideConfirmation : copy.showConfirmation}
          aria-pressed={showConfirmation} aria-controls={`${panelId}-confirmation`} onClick={() => setShowConfirmation((visible) => !visible)}>{showConfirmation ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>}>
        <input id={`${panelId}-confirmation`} ref={(element) => { inputRefs.current.confirmation = element; }} type={showConfirmation ? "text" : "password"} value={confirmPassword}
          placeholder={copy.confirmationPlaceholder} minLength={minimumAuthPasswordLength} required disabled={isSubmitting || authUnavailable}
          aria-invalid={visibleErrors.confirmation ? true : undefined} aria-describedby={fieldDescription("confirmation")} autoComplete="new-password"
          onChange={(event) => setConfirmPassword(event.target.value)} onBlur={() => markTouched("confirmation")} />
      </AuthField> : null}
      {mode === "register" ? <p className="auth-verification-note">{copy.confirmationHint}</p> : null}
      <LoadingButton className="primary-action" type="submit" disabled={isSubmitting || authUnavailable || mode === "reset" && resetSeconds > 0}
        isLoading={isSubmitting && pendingAction === "email"} loadingLabel={copy.loading[mode]}>
        {mode === "updatePassword" ? <LockKeyhole size={17} aria-hidden="true" /> : <Mail size={17} aria-hidden="true" />}
        {mode === "updatePassword" ? t("auth.updatePassword") : mode === "reset" ? t("auth.sendReset") : t(modeLabels[mode])}
      </LoadingButton>
      {mode === "reset" && resetSeconds > 0 ? <p className="auth-resend-status" role="status">{copy.resendCountdown(resetSeconds)}</p> : null}
    </form> : null}
    {notice && noticeContent ? <AuthMessage severity={notice.severity} title={noticeContent.title} actions={actions} messageRef={messageRef}>{noticeContent.body}</AuthMessage> : null}
    {mode === "updatePassword" ? null : <>
      <div className="auth-provider-divider"><span>{copy.providerDivider}</span></div>
      <div className="auth-provider-list" role="group" aria-label={copy.providerLabel}>
        {authPanelProviders(isSupabaseConfigured).filter((provider) => !menu || provider.availability === "supported").map((provider) => provider.id === "google"
          ? <LoadingButton key={provider.id} className="neutral-action auth-google-button auth-provider-option" type="button" onClick={startGoogle}
            disabled={isSubmitting || !provider.enabled} isLoading={isSubmitting && pendingAction === "google"} loadingLabel={copy.googleLoading}>
            <ShieldCheck size={17} aria-hidden="true" />{t(providerLabels[provider.id])}</LoadingButton>
          : <button key={provider.id} className="neutral-action" type="button" disabled title={t(providerTitles[provider.id])}>
            <KeyRound size={17} aria-hidden="true" />{t(providerLabels[provider.id])} <span>{t("auth.comingSoon")}</span></button>)}
      </div>
    </>}
    <p className="auth-security-note"><ShieldCheck size={16} aria-hidden="true" />{copy.security}</p>
  </div>;
};
