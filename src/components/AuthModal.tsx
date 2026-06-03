import { X } from "lucide-react";
import { AuthPanel } from "./AuthPanel";
import { createTranslator } from "../lib/i18n";
import { readStoredLanguage } from "../lib/onboarding";

type AuthModalProps = {
  onClose: () => void;
};

export const AuthModal = ({ onClose }: AuthModalProps) => {
  const language = typeof window === "undefined" ? null : readStoredLanguage(window.localStorage);
  const t = createTranslator(language);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close sign-in">
          <X size={20} aria-hidden="true" />
        </button>
        <div className="section-title">
          <h2 id="auth-title">Plantie account</h2>
        </div>
        <p>Sign in to sync household data. Guest mode and existing household links continue to work without an account.</p>
        <AuthPanel language={language} />
        <a className="auth-delete-link" href="#/delete-account">
          {t("account.delete")}
        </a>
      </section>
    </div>
  );
};
