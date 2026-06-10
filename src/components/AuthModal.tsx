import { X } from "lucide-react";
import { AuthPanel } from "./AuthPanel";
import { readStoredLanguage } from "../lib/onboarding";

type AuthModalProps = {
  onClose: () => void;
};

export const AuthModal = ({ onClose }: AuthModalProps) => {
  const language = typeof window === "undefined" ? null : readStoredLanguage(window.localStorage);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close sign-in">
          <X size={20} aria-hidden="true" />
        </button>
        <div className="section-title">
          <h2 id="auth-title">Plantie account</h2>
        </div>
        <p>Sign in or create an account to sync household data and manage family access.</p>
        <AuthPanel language={language} />
      </section>
    </div>
  );
};
