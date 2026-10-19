import { X } from "lucide-react";
import { browserStorage } from "../lib/browserStorage";
import { readStoredLanguage } from "../lib/onboarding";
import { AuthPanel } from "./AuthPanel";
import { ModalDialog } from "./ModalDialog";

type AuthModalProps = {
  onClose: () => void;
};

export const AuthModal = ({ onClose }: AuthModalProps) => {
  const language = typeof window === "undefined" ? null : readStoredLanguage(browserStorage);

  return (
    <ModalDialog className="auth-modal" labelledBy="auth-title" onClose={onClose}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close sign-in">
          <X size={20} aria-hidden="true" />
        </button>
        <div className="section-title">
          <h2 id="auth-title">Plantie account</h2>
        </div>
        <p>Sign in or create an account to sync household data and manage family access.</p>
        <AuthPanel language={language} />
    </ModalDialog>
  );
};
