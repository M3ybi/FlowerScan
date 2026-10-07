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

type AuthPanelCopy = {
  providerLabel: string; providerDivider: string; showPassword: string; hidePassword: string;
  showConfirmation: string; hideConfirmation: string; passwordHint: (minimum: number) => string;
  confirmationHint: string; unavailable: string;
};

const copy: Record<PlantieLanguage, AuthPanelCopy> = {
  en: {
    providerLabel: "Sign-in providers", providerDivider: "Or continue with", showPassword: "Show password", hidePassword: "Hide password",
    showConfirmation: "Show confirmation password", hideConfirmation: "Hide confirmation password",
    passwordHint: (minimum) => `Use at least ${minimum} characters.`, confirmationHint: "Confirm your email address before signing in.",
    unavailable: "Sign-in is temporarily unavailable in this build.",
  },
  sk: {
    providerLabel: "Možnosti prihlásenia", providerDivider: "Alebo pokračujte cez", showPassword: "Zobraziť heslo", hidePassword: "Skryť heslo",
    showConfirmation: "Zobraziť potvrdenie hesla", hideConfirmation: "Skryť potvrdenie hesla",
    passwordHint: (minimum) => `Použite aspoň ${minimum} znakov.`, confirmationHint: "Pred prihlásením potvrďte svoju emailovú adresu.",
    unavailable: "Prihlásenie je v tejto verzii dočasne nedostupné.",
  },
  de: {
    providerLabel: "Anmeldeoptionen", providerDivider: "Oder fortfahren mit", showPassword: "Passwort anzeigen", hidePassword: "Passwort verbergen",
    showConfirmation: "Bestätigungspasswort anzeigen", hideConfirmation: "Bestätigungspasswort verbergen",
    passwordHint: (minimum) => `Verwende mindestens ${minimum} Zeichen.`, confirmationHint: "Bestätige deine E-Mail-Adresse vor der Anmeldung.",
    unavailable: "Die Anmeldung ist in dieser Version vorübergehend nicht verfügbar.",
  },
  fr: {
    providerLabel: "Options de connexion", providerDivider: "Ou continuer avec", showPassword: "Afficher le mot de passe", hidePassword: "Masquer le mot de passe",
    showConfirmation: "Afficher la confirmation du mot de passe", hideConfirmation: "Masquer la confirmation du mot de passe",
    passwordHint: (minimum) => `Utilisez au moins ${minimum} caractères.`, confirmationHint: "Confirmez votre adresse email avant de vous connecter.",
    unavailable: "La connexion est temporairement indisponible dans cette version.",
  },
  es: {
    providerLabel: "Opciones de inicio de sesión", providerDivider: "O continuar con", showPassword: "Mostrar contraseña", hidePassword: "Ocultar contraseña",
    showConfirmation: "Mostrar la confirmación de contraseña", hideConfirmation: "Ocultar la confirmación de contraseña",
    passwordHint: (minimum) => `Usa al menos ${minimum} caracteres.`, confirmationHint: "Confirma tu dirección de correo antes de iniciar sesión.",
    unavailable: "El inicio de sesión no está disponible temporalmente en esta versión.",
  },
};

export const authPanelCopy = (language: PlantieLanguage | null | undefined = "en") => copy[language ?? "en"];
