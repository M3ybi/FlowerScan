import { validateAuthEmail, validateAuthPassword } from "./authRules";
import type { AuthMode } from "./authRules";
import type { PlantieLanguage } from "./onboarding";

export const authPanelTabModes = ["register", "login", "reset"] as const;
export type AuthPanelTabMode = typeof authPanelTabModes[number];

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

export const authPanelCopy = (language: PlantieLanguage | null | undefined = "en") => copy[language ?? "en"];
