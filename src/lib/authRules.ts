import { createAuthRedirectUrl } from "./authRedirects.js";
import type { AuthRedirectPurpose } from "./authRedirects.js";

export { createAuthRedirectUrl };

export type AuthMode = "register" | "login" | "reset" | "updatePassword";
export type AuthOperation = AuthMode | "google";

export type AuthErrorCode =
  | "invalid_email" | "password_required" | "weak_password" | "password_mismatch"
  | "invalid_credentials" | "unconfirmed_email" | "existing_account" | "user_not_found"
  | "rate_limited" | "invalid_link" | "session_expired" | "provider_conflict"
  | "oauth_failure" | "network" | "unavailable" | "unsupported_redirect_origin"
  | "same_password" | "reauthentication_required" | "reset_cooldown" | "recovery_cleanup_failed";

const authErrorMessages: Record<AuthErrorCode, string> = {
  invalid_email: "Enter a valid email address.",
  password_required: "Enter your password.",
  weak_password: "Password must be at least 8 characters.",
  password_mismatch: "Passwords do not match.",
  invalid_credentials: "Sign-in failed. Check your email and password.",
  unconfirmed_email: "Confirm your email address before signing in.",
  existing_account: "An account already exists for this email. Sign in instead.",
  user_not_found: "No account was found for this email. Create one to continue.",
  rate_limited: "Too many auth emails were requested. Wait a few minutes, then try again.",
  invalid_link: "This authentication link is invalid or expired. Request a new one.",
  session_expired: "Your session expired. Sign in again.",
  provider_conflict: "This sign-in provider is linked to another account. Sign in with your existing method.",
  oauth_failure: "Google sign-in could not be completed. Try again.",
  network: "The connection failed. Check your network and try again.",
  unavailable: "Authentication is unavailable. Try again later.",
  unsupported_redirect_origin: "This address cannot receive Google sign-in or email links. Use localhost on this computer, or a configured hostname on another device.",
  same_password: "Choose a password different from your current password.",
  reauthentication_required: "Request a new password reset link to change your password.",
  reset_cooldown: "Wait before requesting another password reset email.",
  recovery_cleanup_failed: "Your password changed, but the reset session could not be closed. Try finishing the reset again.",
};

export class AuthFlowError extends Error {
  constructor(public readonly code: AuthErrorCode, public readonly retryAt: number | null = null) {
    super(authErrorMessages[code]);
    this.name = "AuthFlowError";
  }
}

export const requireWebAuthRedirectUrl = (currentUrl: string, purpose: AuthRedirectPurpose = "callback") => {
  const redirectUrl = createAuthRedirectUrl(currentUrl, purpose);
  if (!redirectUrl) throw new AuthFlowError("unsupported_redirect_origin");
  return redirectUrl;
};

export const mapSupabaseAuthError = (error: unknown, fallback: AuthErrorCode = "unavailable") => {
  if (error instanceof AuthFlowError) return error;
  if (!error || typeof error !== "object") return new AuthFlowError(fallback);
  const code = "code" in error && typeof error.code === "string" ? error.code.toLowerCase() : "";
  const message = "message" in error && typeof error.message === "string" ? error.message.toLowerCase() : "";
  const status = "status" in error && typeof error.status === "number" ? error.status : null;
  if (status === 429 || code.includes("rate_limit") || message.includes("rate limit")) return new AuthFlowError("rate_limited");
  if (code === "email_address_invalid") return new AuthFlowError("invalid_email");
  if (code === "email_not_confirmed" || message.includes("email not confirmed")) return new AuthFlowError("unconfirmed_email");
  // Account routing requires an explicit provider code, never message text or a signup user shape.
  if (code === "user_already_exists" || code === "email_exists") return new AuthFlowError("existing_account");
  if (code === "user_not_found") return new AuthFlowError("user_not_found");
  if (code === "weak_password" || message.includes("weak password")) return new AuthFlowError("weak_password");
  if (code === "invalid_credentials" || message.includes("invalid login credentials")) return new AuthFlowError("invalid_credentials");
  if (["session_expired", "session_not_found", "refresh_token_not_found", "refresh_token_already_used"].includes(code))
    return new AuthFlowError("session_expired");
  if ("name" in error && error.name === "AuthSessionMissingError") return new AuthFlowError("session_expired");
  if (code === "same_password") return new AuthFlowError("same_password");
  if (["reauthentication_needed", "reauthentication_not_valid"].includes(code)) return new AuthFlowError("reauthentication_required");
  if (["identity_already_exists", "identity_not_found", "email_conflict_identity_not_deletable"].includes(code))
    return new AuthFlowError("provider_conflict");
  if (["bad_oauth_callback", "bad_oauth_state", "oauth_provider_not_supported", "provider_disabled"].includes(code))
    return new AuthFlowError("oauth_failure");
  if (["otp_expired", "flow_state_expired", "flow_state_not_found", "bad_code_verifier"].includes(code) ||
    message.includes("link expired")) return new AuthFlowError("invalid_link");
  if (code === "request_timeout" || code.includes("network") || message.includes("failed to fetch") || message.includes("network"))
    return new AuthFlowError("network");
  return new AuthFlowError(fallback);
};

export type AuthFailureGuidance = {
  code: AuthErrorCode;
  severity: "success" | "info" | "warning" | "error";
  nextMode: AuthMode | null;
  actionModes: AuthMode[];
};

export const resolveAuthFailure = (error: unknown, operation: AuthOperation): AuthFailureGuidance => {
  const mapped = mapSupabaseAuthError(error, operation === "google" ? "oauth_failure" : "unavailable");
  if (operation === "google" && ["invalid_link", "session_expired"].includes(mapped.code)) {
    return { code: "oauth_failure", severity: "error", nextMode: null, actionModes: [] };
  }
  if (operation === "register" && mapped.code === "existing_account") {
    return { code: mapped.code, severity: "info", nextMode: "login", actionModes: ["reset"] };
  }
  if (operation === "login" && mapped.code === "user_not_found") {
    return { code: mapped.code, severity: "info", nextMode: "register", actionModes: [] };
  }
  if (operation === "updatePassword" && ["user_not_found", "session_expired", "invalid_link", "reauthentication_required"].includes(mapped.code)) {
    return { code: mapped.code === "user_not_found" ? "session_expired" : mapped.code, severity: "warning", nextMode: null, actionModes: ["reset"] };
  }
  // Other operations cannot reuse an account-existence result to guess a password or OAuth identity.
  const code = mapped.code === "user_not_found" || mapped.code === "existing_account" ? "unavailable" : mapped.code;
  return {
    code,
    severity: ["rate_limited", "reset_cooldown", "invalid_link", "recovery_cleanup_failed"].includes(code) ? "warning" : "error",
    nextMode: null,
    actionModes: operation === "login" && code === "invalid_credentials" ? ["reset", "register"] : [],
  };
};

export const minimumAuthPasswordLength = 8;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeAuthEmail = (email: string) => email.trim().toLowerCase();

export const validateAuthEmail = (email: string) => emailPattern.test(email.trim());

export const validateAuthPassword = (password: string) => password.length >= minimumAuthPasswordLength;

export const validateRegistrationCode = ({
  confirmPassword,
  email,
  password,
}: {
  confirmPassword: string;
  email: string;
  password: string;
}) => {
  if (!validateAuthEmail(email)) {
    return "invalid_email" as const;
  }

  if (!password) {
    return "password_required" as const;
  }

  if (!validateAuthPassword(password)) {
    return "weak_password" as const;
  }

  if (password !== confirmPassword) {
    return "password_mismatch" as const;
  }

  return null;
};

export const validateRegistrationInput = (input: Parameters<typeof validateRegistrationCode>[0]) => {
  const code = validateRegistrationCode(input);
  return code ? authErrorMessages[code] : null;
};

export const validateLoginCode = ({ email, password }: { email: string; password: string }) => {
  if (!validateAuthEmail(email)) {
    return "invalid_email" as const;
  }

  if (!password) {
    return "password_required" as const;
  }

  return null;
};

export const validateLoginInput = (input: Parameters<typeof validateLoginCode>[0]) => {
  const code = validateLoginCode(input);
  return code ? authErrorMessages[code] : null;
};

export const validatePasswordResetCode = (email: string) =>
  validateAuthEmail(email) ? null : "invalid_email" as const;

export const validatePasswordResetInput = (email: string) => {
  const code = validatePasswordResetCode(email);
  return code ? authErrorMessages[code] : null;
};

export const validatePasswordUpdateCode = ({
  confirmPassword,
  password,
}: {
  confirmPassword: string;
  password: string;
}) => {
  if (!password) {
    return "password_required" as const;
  }

  if (!validateAuthPassword(password)) {
    return "weak_password" as const;
  }

  if (password !== confirmPassword) {
    return "password_mismatch" as const;
  }

  return null;
};

export const validatePasswordUpdateInput = (input: Parameters<typeof validatePasswordUpdateCode>[0]) => {
  const code = validatePasswordUpdateCode(input);
  return code ? authErrorMessages[code] : null;
};

type AuthResponse = {
  error: unknown;
  data?: { session?: object | null; user?: { id?: string; email?: string | null } | null } | null;
};

export type RegistrationOutcome = { status: "signed_in" | "verification_required"; email: string };
export type PasswordResetOutcome = { status: "reset_requested"; email: string; retryAt: number };
export type PasswordUpdateOutcome = { status: "password_updated"; email: string | null };

// This is a per-instance UX cooldown. Supabase remains responsible for server-side abuse protection.
export const passwordResetCooldownMs = 60_000;
export const passwordResetRemainingSeconds = (retryAt: number, now = Date.now()) =>
  Number.isFinite(retryAt) && Number.isFinite(now) ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : 0;

export type AuthActionsClient = {
  auth: {
    resetPasswordForEmail(email: string, options: { redirectTo: string | undefined }): Promise<{ error: unknown }>;
    signInWithOAuth(input: { options: { redirectTo: string | undefined }; provider: "google" }): Promise<{ error: unknown }>;
    signInWithOtp(input: { email: string; options: { emailRedirectTo: string | undefined } }): Promise<{ error: unknown }>;
    signInWithPassword(input: { email: string; password: string }): Promise<AuthResponse>;
    signUp(input: { email: string; password: string; options: { emailRedirectTo: string | undefined } }): Promise<AuthResponse>;
    updateUser(input: { password: string }): Promise<AuthResponse>;
  };
};

export const createAuthActions = (deps: {
  getClient: () => AuthActionsClient;
  getRedirectUrl: (purpose?: AuthRedirectPurpose) => string | undefined;
  now?: () => number;
}) => {
  const now = deps.now ?? Date.now;
  let passwordResetRetryAt = 0;
  let resetInFlight = false;
  const completeAuthRequest = async <T extends { error: unknown }>(request: () => Promise<T>, fallback: AuthErrorCode = "unavailable"): Promise<T> => {
    try {
      const result = await request();
      if (result.error) throw mapSupabaseAuthError(result.error, fallback);
      return result;
    } catch (error) {
      if (error instanceof AuthFlowError) throw error;
      throw mapSupabaseAuthError(error, fallback);
    }
  };

  return {
    async signInWithMagicLink(email: string) {
      const normalizedEmail = normalizeAuthEmail(email);
      if (!validateAuthEmail(normalizedEmail)) throw new AuthFlowError("invalid_email");

      await completeAuthRequest(() => deps.getClient().auth.signInWithOtp({
        email: normalizedEmail,
        options: { emailRedirectTo: deps.getRedirectUrl() },
      }));
    },

    async registerWithEmailPassword(email: string, password: string): Promise<RegistrationOutcome> {
      const normalizedEmail = normalizeAuthEmail(email);
      const validationError = validateRegistrationCode({
        confirmPassword: password,
        email: normalizedEmail,
        password,
      });

      if (validationError) {
        throw new AuthFlowError(validationError);
      }

      const result = await completeAuthRequest(() => deps.getClient().auth.signUp({
        email: normalizedEmail,
        password,
        options: { emailRedirectTo: deps.getRedirectUrl("confirmation") },
      }));
      // A no-session response can be obfuscated for an existing account. Never inspect identities.
      return { status: result.data?.session ? "signed_in" : "verification_required", email: normalizedEmail };
    },

    async signInWithEmailPassword(email: string, password: string) {
      const normalizedEmail = normalizeAuthEmail(email);
      const validationError = validateLoginCode({ email: normalizedEmail, password });
      if (validationError) {
        throw new AuthFlowError(validationError);
      }

      await completeAuthRequest(() => deps.getClient().auth.signInWithPassword({
        email: normalizedEmail,
        password,
      }));
    },

    getPasswordResetRetryAt: () => passwordResetRetryAt,

    async requestPasswordReset(email: string): Promise<PasswordResetOutcome> {
      const normalizedEmail = normalizeAuthEmail(email);
      const validationError = validatePasswordResetCode(normalizedEmail);
      if (validationError) {
        throw new AuthFlowError(validationError);
      }

      if (resetInFlight || now() < passwordResetRetryAt) throw new AuthFlowError("reset_cooldown", passwordResetRetryAt);
      // Establish the cooldown before I/O so duplicate or alternate-email requests do not bypass it.
      resetInFlight = true;
      passwordResetRetryAt = now() + passwordResetCooldownMs;
      try {
        await completeAuthRequest(() => deps.getClient().auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo: deps.getRedirectUrl("recovery"),
        }));
      } catch (error) {
        const mapped = mapSupabaseAuthError(error);
        // Recovery requests never become a client-accessible account-existence signal.
        if (mapped.code !== "user_not_found") {
          if (mapped.code !== "rate_limited") passwordResetRetryAt = 0;
          throw mapped;
        }
      } finally {
        resetInFlight = false;
      }
      passwordResetRetryAt = now() + passwordResetCooldownMs;
      return { status: "reset_requested", email: normalizedEmail, retryAt: passwordResetRetryAt };
    },

    async signInWithGoogle() {
      await completeAuthRequest(() => deps.getClient().auth.signInWithOAuth({
        options: { redirectTo: deps.getRedirectUrl() },
        provider: "google",
      }), "oauth_failure");
    },

    async updatePassword(password: string, confirmPassword: string): Promise<PasswordUpdateOutcome> {
      const validationError = validatePasswordUpdateCode({ confirmPassword, password });
      if (validationError) {
        throw new AuthFlowError(validationError);
      }

      const result = await completeAuthRequest(() => deps.getClient().auth.updateUser({ password }));
      const userId = result.data?.user?.id;
      if (typeof userId !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(userId)) {
        throw new AuthFlowError("unavailable");
      }
      const email = result.data?.user?.email;
      return { status: "password_updated", email: typeof email === "string" && validateAuthEmail(email) ? normalizeAuthEmail(email) : null };
    },
  };
};
