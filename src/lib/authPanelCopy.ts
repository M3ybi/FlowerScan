import { validateAuthEmail, validateAuthPassword } from "./authRules";
import type { AuthErrorCode, AuthMode } from "./authRules";
import { createTranslator } from "./i18n";
import type { PlantieLanguage } from "./onboarding";

export const authPanelTabModes = ["register", "login", "reset"] as const;
export type AuthPanelTabMode = typeof authPanelTabModes[number];

export type AuthMessageSeverity = "success" | "info" | "warning" | "error";
export type AuthNoticeKey = AuthErrorCode | "password_changed" | "verification_requested" | "reset_requested" | "signed_in";
// Only finite, localized notices cross the recovery handoff; no provider text or credentials.
export type AuthNotice = { key: AuthNoticeKey; severity: AuthMessageSeverity; actionModes?: AuthMode[] };

// Apple and Amazon are the existing planned options; neither has an auth handler.
export const authPanelProviderAvailability = [
  { id: "google", availability: "supported" },
  { id: "apple", availability: "planned" },
  { id: "amazon", availability: "planned" },
] as const;

export const authPanelProviders = (configured: boolean) => authPanelProviderAvailability.map((provider) => ({
  ...provider, enabled: provider.availability === "supported" && configured,
}));

export const authPanelKeyboardMode = (current: AuthMode, key: string): AuthPanelTabMode | null => {
  const index = authPanelTabModes.indexOf(current as AuthPanelTabMode);
  if (index < 0) return null;
  if (key === "Home") return authPanelTabModes[0];
  if (key === "End") return authPanelTabModes[authPanelTabModes.length - 1];
  if (key === "ArrowRight") return authPanelTabModes[(index + 1) % authPanelTabModes.length];
  if (key === "ArrowLeft") return authPanelTabModes[(index + authPanelTabModes.length - 1) % authPanelTabModes.length];
  return null;
};

export type AuthPanelField = "email" | "password" | "confirmation";
export type AuthPanelFieldError = "email_required" | "invalid_email" | "password_required" | "weak_password" | "confirmation_required" | "password_mismatch";
export type AuthPanelFieldErrors = Partial<Record<AuthPanelField, AuthPanelFieldError>>;

// Presentation uses the same email/password constraints as the auth service.
export const authPanelFieldErrors = ({ mode, email, password, confirmPassword }: {
  mode: AuthMode; email: string; password: string; confirmPassword: string;
}): AuthPanelFieldErrors => {
  const errors: AuthPanelFieldErrors = {};
  if (mode !== "updatePassword") {
    if (!email.trim()) errors.email = "email_required";
    else if (!validateAuthEmail(email)) errors.email = "invalid_email";
  }
  if (mode !== "reset") {
    if (!password) errors.password = "password_required";
    else if (mode !== "login" && !validateAuthPassword(password)) errors.password = "weak_password";
  }
  if (mode === "register" || mode === "updatePassword") {
    if (!confirmPassword) errors.confirmation = "confirmation_required";
    else if (password !== confirmPassword) errors.confirmation = "password_mismatch";
  }
  return errors;
};

export const authPanelVisibleFieldErrors = (errors: AuthPanelFieldErrors, touched: readonly AuthPanelField[], submitted: boolean): AuthPanelFieldErrors => {
  if (submitted) return errors;
  return Object.fromEntries(Object.entries(errors).filter(([field]) => touched.includes(field as AuthPanelField)));
};

type AuthPanelCopy = {
  providerLabel: string; providerDivider: string; showPassword: string; hidePassword: string;
  showConfirmation: string; hideConfirmation: string; passwordHint: (minimum: number) => string;
  confirmationHint: string; unavailable: string; security: string;
  emailPlaceholder: string; createPasswordPlaceholder: string; passwordPlaceholder: string; confirmationPlaceholder: string;
  emailRequired: string; confirmationRequired: string;
  loading: Record<AuthMode, string>; googleLoading: string;
};

const copy: Record<PlantieLanguage, AuthPanelCopy> = {
  en: {
    providerLabel: "Sign-in providers", providerDivider: "Or continue with", showPassword: "Show password", hidePassword: "Hide password",
    showConfirmation: "Show confirmation password", hideConfirmation: "Hide confirmation password",
    passwordHint: (minimum) => `At least ${minimum} characters.`, confirmationHint: "Confirm your email to sign in.",
    unavailable: "Sign-in is temporarily unavailable in this build.",
    security: "Authentication is handled by Supabase Auth.",
    emailPlaceholder: "you@example.com", createPasswordPlaceholder: "Create a password", passwordPlaceholder: "Your password", confirmationPlaceholder: "Repeat your password",
    emailRequired: "Enter your email address.", confirmationRequired: "Repeat your password.",
    loading: { register: "Creating account…", login: "Signing in…", reset: "Sending reset email…", updatePassword: "Updating password…" }, googleLoading: "Opening Google…",
  },
  sk: {
    providerLabel: "Možnosti prihlásenia", providerDivider: "Alebo pokračujte cez", showPassword: "Zobraziť heslo", hidePassword: "Skryť heslo",
    showConfirmation: "Zobraziť potvrdenie hesla", hideConfirmation: "Skryť potvrdenie hesla",
    passwordHint: (minimum) => `Aspoň ${minimum} znakov.`, confirmationHint: "Na prihlásenie potvrďte svoj email.",
    unavailable: "Prihlásenie je v tejto verzii dočasne nedostupné.",
    security: "Prihlásenie spravuje Supabase Auth.",
    emailPlaceholder: "vas@email.sk", createPasswordPlaceholder: "Vytvorte heslo", passwordPlaceholder: "Vaše heslo", confirmationPlaceholder: "Zopakujte heslo",
    emailRequired: "Zadajte svoju emailovú adresu.", confirmationRequired: "Zopakujte heslo.",
    loading: { register: "Vytváranie účtu…", login: "Prihlasovanie…", reset: "Odosielanie odkazu…", updatePassword: "Aktualizácia hesla…" }, googleLoading: "Otváranie Google…",
  },
  de: {
    providerLabel: "Anmeldeoptionen", providerDivider: "Oder fortfahren mit", showPassword: "Passwort anzeigen", hidePassword: "Passwort verbergen",
    showConfirmation: "Bestätigungspasswort anzeigen", hideConfirmation: "Bestätigungspasswort verbergen",
    passwordHint: (minimum) => `Mindestens ${minimum} Zeichen.`, confirmationHint: "Bestätige deine E-Mail zur Anmeldung.",
    unavailable: "Die Anmeldung ist in dieser Version vorübergehend nicht verfügbar.",
    security: "Die Anmeldung erfolgt über Supabase Auth.",
    emailPlaceholder: "du@beispiel.de", createPasswordPlaceholder: "Passwort erstellen", passwordPlaceholder: "Dein Passwort", confirmationPlaceholder: "Passwort wiederholen",
    emailRequired: "Gib deine E-Mail-Adresse ein.", confirmationRequired: "Wiederhole dein Passwort.",
    loading: { register: "Konto wird erstellt…", login: "Anmeldung läuft…", reset: "Link wird gesendet…", updatePassword: "Passwort wird aktualisiert…" }, googleLoading: "Google wird geöffnet…",
  },
  fr: {
    providerLabel: "Options de connexion", providerDivider: "Ou continuer avec", showPassword: "Afficher le mot de passe", hidePassword: "Masquer le mot de passe",
    showConfirmation: "Afficher la confirmation du mot de passe", hideConfirmation: "Masquer la confirmation du mot de passe",
    passwordHint: (minimum) => `Au moins ${minimum} caractères.`, confirmationHint: "Confirmez votre email pour vous connecter.",
    unavailable: "La connexion est temporairement indisponible dans cette version.",
    security: "La connexion est gérée par Supabase Auth.",
    emailPlaceholder: "vous@exemple.fr", createPasswordPlaceholder: "Créez un mot de passe", passwordPlaceholder: "Votre mot de passe", confirmationPlaceholder: "Répétez le mot de passe",
    emailRequired: "Saisissez votre adresse email.", confirmationRequired: "Répétez votre mot de passe.",
    loading: { register: "Création du compte…", login: "Connexion…", reset: "Envoi du lien…", updatePassword: "Mise à jour du mot de passe…" }, googleLoading: "Ouverture de Google…",
  },
  es: {
    providerLabel: "Opciones de inicio de sesión", providerDivider: "O continuar con", showPassword: "Mostrar contraseña", hidePassword: "Ocultar contraseña",
    showConfirmation: "Mostrar la confirmación de contraseña", hideConfirmation: "Ocultar la confirmación de contraseña",
    passwordHint: (minimum) => `Al menos ${minimum} caracteres.`, confirmationHint: "Confirma tu correo para iniciar sesión.",
    unavailable: "El inicio de sesión no está disponible temporalmente en esta versión.",
    security: "El acceso se gestiona con Supabase Auth.",
    emailPlaceholder: "tu@ejemplo.es", createPasswordPlaceholder: "Crea una contraseña", passwordPlaceholder: "Tu contraseña", confirmationPlaceholder: "Repite tu contraseña",
    emailRequired: "Introduce tu correo electrónico.", confirmationRequired: "Repite tu contraseña.",
    loading: { register: "Creando cuenta…", login: "Iniciando sesión…", reset: "Enviando enlace…", updatePassword: "Actualizando contraseña…" }, googleLoading: "Abriendo Google…",
  },
};

type RecoveryCopy = {
  newPasswordPlaceholder: string; confirmNewPassword: string; requestNewReset: string;
  finishRecovery: string; finishingRecovery: string; resendCountdown: (seconds: number) => string;
  notices: Partial<Record<AuthNoticeKey, { title: string; body: string }>>;
  errorTitle: string;
};

const recoveryCopy: Record<PlantieLanguage, RecoveryCopy> = {
  en: {
    newPasswordPlaceholder: "Create a new password", confirmNewPassword: "Confirm new password", requestNewReset: "Request a new reset link",
    finishRecovery: "Finish password reset", finishingRecovery: "Finishing password reset…", resendCountdown: (seconds) => `Request another link in ${seconds}s.`, errorTitle: "Please try again",
    notices: {
      password_changed: { title: "Password changed successfully.", body: "Sign in with your new password." },
      verification_requested: { title: "Check your email", body: "If registration can proceed, you’ll receive a confirmation link. Already registered? Sign in or reset your password." },
      reset_requested: { title: "Check your email", body: "If an account uses this email, you’ll receive a password reset link. Check your inbox and spam folder." },
      signed_in: { title: "Signed in", body: "You can now continue to Plantie." },
      existing_account: { title: "Sign in instead", body: "This email already has an account. Sign in or reset your password." },
      user_not_found: { title: "Create your account", body: "The sign-in provider found no account for this email. Create an account to continue." },
      invalid_link: { title: "Reset link unavailable", body: "This reset link is invalid or expired. Request a new link to change your password." },
      session_expired: { title: "Reset session expired", body: "Request a new reset link before changing your password." },
      reauthentication_required: { title: "A new reset link is needed", body: "Request a new reset link to securely change your password." },
      same_password: { title: "Choose a new password", body: "Your new password must be different from your current password." },
      reset_cooldown: { title: "Please wait", body: "Wait before requesting another password reset link." },
      recovery_cleanup_failed: { title: "Password changed", body: "The reset session could not be closed. Finish the reset to return to Sign in; your password will not be changed again." },
    },
  },
  sk: {
    newPasswordPlaceholder: "Vytvorte nové heslo", confirmNewPassword: "Potvrdenie nového hesla", requestNewReset: "Vyžiadať nový odkaz",
    finishRecovery: "Dokončiť obnovu hesla", finishingRecovery: "Dokončovanie obnovy…", resendCountdown: (seconds) => `Ďalší odkaz môžete vyžiadať o ${seconds} s.`, errorTitle: "Skúste to znova",
    notices: {
      password_changed: { title: "Heslo bolo zmenené", body: "Pokračujte prihlásením s novým heslom." },
      verification_requested: { title: "Skontrolujte email", body: "Ak je registrácia možná, dostanete potvrdzovací odkaz. Už máte účet? Prihláste sa alebo obnovte heslo." },
      reset_requested: { title: "Skontrolujte email", body: "Ak k tomuto emailu existuje účet, dostanete odkaz na obnovu hesla. Skontrolujte aj priečinok so spamom." },
      signed_in: { title: "Ste prihlásení", body: "Teraz môžete pokračovať do Plantie." },
      existing_account: { title: "Prihláste sa", body: "K tomuto emailu už existuje účet. Prihláste sa alebo obnovte heslo." },
      user_not_found: { title: "Vytvorte si účet", body: "Poskytovateľ prihlásenia nenašiel účet pre tento email. Pokračujte vytvorením účtu." },
      invalid_link: { title: "Odkaz na obnovu nie je dostupný", body: "Tento odkaz je neplatný alebo vypršal. Na zmenu hesla si vyžiadajte nový." },
      session_expired: { title: "Relácia obnovy vypršala", body: "Pred zmenou hesla si vyžiadajte nový odkaz na obnovu." },
      reauthentication_required: { title: "Potrebujete nový odkaz", body: "Na bezpečnú zmenu hesla si vyžiadajte nový odkaz na obnovu." },
      same_password: { title: "Zvoľte nové heslo", body: "Nové heslo musí byť odlišné od aktuálneho hesla." },
      reset_cooldown: { title: "Chvíľu počkajte", body: "Pred vyžiadaním ďalšieho odkazu na obnovu hesla počkajte." },
      recovery_cleanup_failed: { title: "Heslo bolo zmenené", body: "Reláciu obnovy sa nepodarilo ukončiť. Dokončite obnovu a vráťte sa k prihláseniu; heslo sa už znova nezmení." },
    },
  },
  de: {
    newPasswordPlaceholder: "Neues Passwort erstellen", confirmNewPassword: "Neues Passwort bestätigen", requestNewReset: "Neuen Link anfordern",
    finishRecovery: "Passwortzurücksetzung abschließen", finishingRecovery: "Zurücksetzung wird abgeschlossen…", resendCountdown: (seconds) => `In ${seconds} s kannst du einen weiteren Link anfordern.`, errorTitle: "Versuche es erneut",
    notices: {
      password_changed: { title: "Passwort geändert", body: "Melde dich mit deinem neuen Passwort an, um fortzufahren." },
      verification_requested: { title: "Prüfe deine E-Mails", body: "Wenn die Registrierung möglich ist, erhältst du einen Bestätigungslink. Schon registriert? Melde dich an oder setze dein Passwort zurück." },
      reset_requested: { title: "Prüfe deine E-Mails", body: "Falls ein Konto diese E-Mail verwendet, erhältst du einen Link zum Zurücksetzen. Prüfe auch deinen Spamordner." },
      signed_in: { title: "Angemeldet", body: "Du kannst jetzt in Plantie fortfahren." },
      existing_account: { title: "Melde dich an", body: "Für diese E-Mail besteht bereits ein Konto. Melde dich an oder setze dein Passwort zurück." },
      user_not_found: { title: "Erstelle dein Konto", body: "Der Anmeldeanbieter hat kein Konto für diese E-Mail gefunden. Erstelle ein Konto, um fortzufahren." },
      invalid_link: { title: "Link nicht verfügbar", body: "Dieser Link ist ungültig oder abgelaufen. Fordere einen neuen Link an, um dein Passwort zu ändern." },
      session_expired: { title: "Zurücksetzungssitzung abgelaufen", body: "Fordere einen neuen Link an, bevor du dein Passwort änderst." },
      reauthentication_required: { title: "Ein neuer Link ist erforderlich", body: "Fordere einen neuen Link an, um dein Passwort sicher zu ändern." },
      same_password: { title: "Wähle ein neues Passwort", body: "Dein neues Passwort muss sich vom aktuellen Passwort unterscheiden." },
      reset_cooldown: { title: "Bitte warte", body: "Warte, bevor du einen weiteren Link zum Zurücksetzen anforderst." },
      recovery_cleanup_failed: { title: "Passwort geändert", body: "Die Sitzung konnte nicht beendet werden. Schließe die Zurücksetzung ab, um zur Anmeldung zurückzukehren; dein Passwort wird nicht erneut geändert." },
    },
  },
  fr: {
    newPasswordPlaceholder: "Créez un nouveau mot de passe", confirmNewPassword: "Confirmer le nouveau mot de passe", requestNewReset: "Demander un nouveau lien",
    finishRecovery: "Terminer la réinitialisation", finishingRecovery: "Finalisation de la réinitialisation…", resendCountdown: (seconds) => `Vous pourrez demander un autre lien dans ${seconds} s.`, errorTitle: "Réessayez",
    notices: {
      password_changed: { title: "Mot de passe modifié", body: "Connectez-vous avec votre nouveau mot de passe pour continuer." },
      verification_requested: { title: "Consultez vos emails", body: "Si l’inscription est possible, vous recevrez un lien de confirmation. Déjà inscrit ? Connectez-vous ou réinitialisez votre mot de passe." },
      reset_requested: { title: "Consultez vos emails", body: "Si un compte utilise cet email, vous recevrez un lien de réinitialisation. Vérifiez aussi vos spams." },
      signed_in: { title: "Connexion réussie", body: "Vous pouvez maintenant continuer dans Plantie." },
      existing_account: { title: "Connectez-vous", body: "Un compte existe déjà pour cet email. Connectez-vous ou réinitialisez votre mot de passe." },
      user_not_found: { title: "Créez votre compte", body: "Le fournisseur de connexion n’a trouvé aucun compte pour cet email. Créez un compte pour continuer." },
      invalid_link: { title: "Lien indisponible", body: "Ce lien est invalide ou expiré. Demandez un nouveau lien pour modifier votre mot de passe." },
      session_expired: { title: "Session de réinitialisation expirée", body: "Demandez un nouveau lien avant de modifier votre mot de passe." },
      reauthentication_required: { title: "Un nouveau lien est nécessaire", body: "Demandez un nouveau lien pour modifier votre mot de passe en toute sécurité." },
      same_password: { title: "Choisissez un nouveau mot de passe", body: "Votre nouveau mot de passe doit être différent du mot de passe actuel." },
      reset_cooldown: { title: "Veuillez patienter", body: "Patientez avant de demander un autre lien de réinitialisation." },
      recovery_cleanup_failed: { title: "Mot de passe modifié", body: "La session n’a pas pu être fermée. Terminez la réinitialisation pour revenir à la connexion ; le mot de passe ne sera pas modifié à nouveau." },
    },
  },
  es: {
    newPasswordPlaceholder: "Crea una nueva contraseña", confirmNewPassword: "Confirmar nueva contraseña", requestNewReset: "Solicitar un nuevo enlace",
    finishRecovery: "Terminar el restablecimiento", finishingRecovery: "Terminando el restablecimiento…", resendCountdown: (seconds) => `Podrás solicitar otro enlace en ${seconds} s.`, errorTitle: "Inténtalo de nuevo",
    notices: {
      password_changed: { title: "Contraseña cambiada", body: "Inicia sesión con tu nueva contraseña para continuar." },
      verification_requested: { title: "Revisa tu correo", body: "Si es posible registrarse, recibirás un enlace de confirmación. ¿Ya tienes cuenta? Inicia sesión o restablece tu contraseña." },
      reset_requested: { title: "Revisa tu correo", body: "Si hay una cuenta con este correo, recibirás un enlace de restablecimiento. Revisa también la carpeta de spam." },
      signed_in: { title: "Sesión iniciada", body: "Ya puedes continuar en Plantie." },
      existing_account: { title: "Inicia sesión", body: "Ya existe una cuenta con este correo. Inicia sesión o restablece tu contraseña." },
      user_not_found: { title: "Crea tu cuenta", body: "El proveedor de acceso no encontró una cuenta con este correo. Crea una cuenta para continuar." },
      invalid_link: { title: "Enlace no disponible", body: "Este enlace no es válido o ha caducado. Solicita uno nuevo para cambiar tu contraseña." },
      session_expired: { title: "Sesión de restablecimiento caducada", body: "Solicita un nuevo enlace antes de cambiar tu contraseña." },
      reauthentication_required: { title: "Necesitas un nuevo enlace", body: "Solicita un nuevo enlace para cambiar tu contraseña de forma segura." },
      same_password: { title: "Elige una contraseña nueva", body: "La nueva contraseña debe ser diferente de la actual." },
      reset_cooldown: { title: "Espera un momento", body: "Espera antes de solicitar otro enlace de restablecimiento." },
      recovery_cleanup_failed: { title: "Contraseña cambiada", body: "No se pudo cerrar la sesión. Termina el restablecimiento para volver al inicio de sesión; la contraseña no se cambiará otra vez." },
    },
  },
};

export const authPanelCopy = (language: PlantieLanguage | null | undefined = "en") => ({ ...copy[language ?? "en"], ...recoveryCopy[language ?? "en"] });

export const authPanelNoticeContent = (key: AuthNoticeKey, language: PlantieLanguage | null | undefined = "en") => {
  const localized = recoveryCopy[language ?? "en"];
  return localized.notices[key] ?? { title: localized.errorTitle, body: createTranslator(language)(`auth.error.${key}`) };
};
