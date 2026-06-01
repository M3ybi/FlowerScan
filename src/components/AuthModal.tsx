import { useState } from "react";
import type { FormEvent } from "react";
import { Mail, X } from "lucide-react";
import { signInWithGoogle, signInWithMagicLink, validateAuthEmail } from "../lib/authService";

type AuthModalProps = {
  onClose: () => void;
};

export const AuthModal = ({ onClose }: AuthModalProps) => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleMagicLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim();

    if (!validateAuthEmail(normalizedEmail)) {
      setStatus("Zadaj platnú emailovú adresu.");
      return;
    }

    try {
      setIsSubmitting(true);
      setStatus("");
      await signInWithMagicLink(normalizedEmail);
      setStatus("Prihlasovací link bol odoslaný. Skontroluj email.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Prihlásenie sa nepodarilo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    try {
      setIsSubmitting(true);
      setStatus("");
      await signInWithGoogle();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Prihlásenie cez Google sa nepodarilo.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Zavrieť prihlásenie">
          <X size={20} aria-hidden="true" />
        </button>
        <div className="section-title">
          <Mail size={18} aria-hidden="true" />
          <h2 id="auth-title">Plantie účet</h2>
        </div>
        <p>
          Prihlásenie je voliteľné. Súčasný link domácnosti a lokálne uložené dáta fungujú ďalej bez zmeny.
        </p>

        <form className="auth-form" onSubmit={handleMagicLink}>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              placeholder="meno@example.com"
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <button className="primary-action" type="submit" disabled={isSubmitting}>
            Poslať magic link
          </button>
        </form>

        <button className="neutral-action auth-google-button" type="button" onClick={handleGoogle} disabled={isSubmitting}>
          Prihlásiť cez Google
        </button>

        {status ? <div className="report-status">{status}</div> : null}
      </section>
    </div>
  );
};
