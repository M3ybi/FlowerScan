import { useState } from "react";
import type { FormEvent } from "react";
import { KeyRound, Mail, ShieldCheck } from "lucide-react";
import {
  registerWithEmailPassword,
  requestPasswordReset,
  signInWithEmailPassword,
  signInWithGoogle,
  updatePassword,
} from "../lib/authService";
import {
  minimumAuthPasswordLength,
  validateLoginInput,
  validatePasswordResetInput,
  validatePasswordUpdateInput,
  validateRegistrationInput,
} from "../lib/authRules";
import type { AuthMode } from "../lib/authRules";
import { createTranslator } from "../lib/i18n";
import type { PlantieLanguage } from "../lib/onboarding";

type AuthPanelProps = {
  compact?: boolean;
  initialMode?: AuthMode;
  language?: PlantieLanguage | null;
  onSuccess?: () => void;
};

export const AuthPanel = ({ compact = false, initialMode = "register", language = null, onSuccess }: AuthPanelProps) => {
  const t = createTranslator(language);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetSensitiveFields = () => {
    setPassword("");
    setConfirmPassword("");
  };

  const submitEmailAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedEmail = email.trim();
    const validationError =
      mode === "register"
        ? validateRegistrationInput({ confirmPassword, email: normalizedEmail, password })
        : mode === "login"
          ? validateLoginInput({ email: normalizedEmail, password })
          : mode === "updatePassword"
            ? validatePasswordUpdateInput({ confirmPassword, password })
            : validatePasswordResetInput(normalizedEmail);

    if (validationError) {
      setStatus(validationError);
      return;
    }

    try {
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
      onSuccess?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("auth.failed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const startGoogle = async () => {
    try {
      setIsSubmitting(true);
      setStatus("");
      await signInWithGoogle();
      onSuccess?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("auth.googleFailed"));
      setIsSubmitting(false);
    }
  };

  return (
    <div className={compact ? "auth-panel auth-panel-compact" : "auth-panel"}>
      {mode === "updatePassword" ? null : (
        <div className="auth-mode-tabs" role="tablist" aria-label={t("auth.modeLabel")}>
          <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>
            {t("auth.create")}
          </button>
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
            {t("auth.login")}
          </button>
          <button type="button" className={mode === "reset" ? "active" : ""} onClick={() => setMode("reset")}>
            {t("auth.reset")}
          </button>
        </div>
      )}

      <form className="auth-form" onSubmit={submitEmailAuth}>
        {mode === "updatePassword" ? null : <label className="field">
          <span>{t("auth.email")}</span>
          <input
            type="email"
            value={email}
            placeholder="you@example.com"
            autoComplete="email"
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>}
        {mode !== "reset" ? (
          <label className="field">
            <span>{mode === "updatePassword" ? t("auth.newPassword") : t("auth.password")}</span>
            <input
              type="password"
              value={password}
              minLength={minimumAuthPasswordLength}
              autoComplete={mode === "register" || mode === "updatePassword" ? "new-password" : "current-password"}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        ) : null}
        {mode === "register" || mode === "updatePassword" ? (
          <label className="field">
            <span>{t("auth.passwordConfirm")}</span>
            <input
              type="password"
              value={confirmPassword}
              minLength={minimumAuthPasswordLength}
              autoComplete="new-password"
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>
        ) : null}
        <button className="primary-action" type="submit" disabled={isSubmitting}>
          <Mail size={17} aria-hidden="true" />
          {mode === "register"
            ? t("auth.create")
            : mode === "login"
              ? t("auth.login")
              : mode === "updatePassword"
                ? t("auth.updatePassword")
                : t("auth.sendReset")}
        </button>
      </form>

      {mode === "updatePassword" ? null : <div className="auth-provider-list" aria-label="Sign-in providers">
        <button className="neutral-action auth-google-button" type="button" onClick={startGoogle} disabled={isSubmitting}>
          <ShieldCheck size={17} aria-hidden="true" />
          {t("auth.google")}
        </button>
        <button className="neutral-action" type="button" disabled title={t("auth.appleSetupRequired")}>
          <KeyRound size={17} aria-hidden="true" />
          {t("auth.apple")} <span>{t("auth.comingSoon")}</span>
        </button>
        <button className="neutral-action" type="button" disabled title={t("auth.amazonNotConfigured")}>
          <KeyRound size={17} aria-hidden="true" />
          {t("auth.amazon")} <span>{t("auth.comingSoon")}</span>
        </button>
      </div>}

      <p className="auth-security-note">{t("auth.security")}</p>
      {status ? <div className="report-status" role="status">{status}</div> : null}
    </div>
  );
};
