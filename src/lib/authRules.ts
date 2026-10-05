import { createAuthRedirectUrl } from "./authRedirects.js";
import type { AuthRedirectPurpose } from "./authRedirects.js";

export { createAuthRedirectUrl };

export type AuthMode = "register" | "login" | "reset" | "updatePassword";

export type AuthErrorCode =
  | "invalid_email" | "password_required" | "weak_password" | "password_mismatch"
  | "invalid_credentials" | "unconfirmed_email" | "existing_account"
  | "rate_limited" | "invalid_link" | "session_expired" | "provider_conflict"
  | "oauth_failure" | "network" | "unavailable" | "unsupported_redirect_origin";

const authErrorMessages: Record<AuthErrorCode, string> = {
  invalid_email: "Enter a valid email address.",
  password_required: "Enter your password.",
  weak_password: "Password must be at least 8 characters.",
  password_mismatch: "Passwords do not match.",
  invalid_credentials: "Sign-in failed. Check your email and password.",
  unconfirmed_email: "Confirm your email address before signing in.",
  existing_account: "This address may already have an account. Try signing in or resetting your password.",
  rate_limited: "Too many auth emails were requested. Wait a few minutes, then try again.",
  invalid_link: "This authentication link is invalid or expired. Request a new one.",
  session_expired: "Your session expired. Sign in again.",
  provider_conflict: "This sign-in provider is linked to another account. Sign in with your existing method.",
  oauth_failure: "Google sign-in could not be completed. Try again.",
  network: "The connection failed. Check your network and try again.",
  unavailable: "Authentication is unavailable. Try again later.",
  unsupported_redirect_origin: "This address cannot receive Google sign-in or email links. Use localhost on this computer, or a configured hostname on another device.",
};

export class AuthFlowError extends Error {
  constructor(public readonly code: AuthErrorCode) {
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
  if (!error || typeof error !== "object") return new AuthFlowError(fallback);
  const code = "code" in error && typeof error.code === "string" ? error.code.toLowerCase() : "";
  const message = "message" in error && typeof error.message === "string" ? error.message.toLowerCase() : "";
  const status = "status" in error && typeof error.status === "number" ? error.status : null;
  if (status === 429 || code.includes("rate_limit") || message.includes("rate limit")) return new AuthFlowError("rate_limited");
  if (code === "email_address_invalid") return new AuthFlowError("invalid_email");
  if (code === "email_not_confirmed" || message.includes("email not confirmed")) return new AuthFlowError("unconfirmed_email");
  if (code === "user_already_exists" || code === "email_exists" || message.includes("already registered")) return new AuthFlowError("existing_account");
  if (code === "weak_password" || message.includes("weak password")) return new AuthFlowError("weak_password");
  if (code === "invalid_credentials" || message.includes("invalid login credentials")) return new AuthFlowError("invalid_credentials");
  if (["session_expired", "session_not_found", "refresh_token_not_found", "refresh_token_already_used"].includes(code))
    return new AuthFlowError("session_expired");
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

export const minimumAuthPasswordLength = 8;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export type AuthActionsClient = {
  auth: {
    resetPasswordForEmail(email: string, options: { redirectTo: string | undefined }): Promise<{ error: unknown }>;
    signInWithOAuth(input: { options: { redirectTo: string | undefined }; provider: "google" }): Promise<{ error: unknown }>;
    signInWithOtp(input: { email: string; options: { emailRedirectTo: string | undefined } }): Promise<{ error: unknown }>;
    signInWithPassword(input: { email: string; password: string }): Promise<{ error: unknown }>;
    signUp(input: { email: string; password: string; options: { emailRedirectTo: string | undefined } }): Promise<{ error: unknown }>;
    updateUser(input: { password: string }): Promise<{ error: unknown }>;
  };
};

export const createAuthActions = (deps: {
  getClient: () => AuthActionsClient;
  getRedirectUrl: (purpose?: AuthRedirectPurpose) => string | undefined;
}) => {
  const normalizeEmail = (email: string) => email.trim().toLowerCase();
  const completeAuthRequest = async (request: () => Promise<{ error: unknown }>, fallback: AuthErrorCode = "unavailable") => {
    try {
      const { error } = await request();
      if (error) throw mapSupabaseAuthError(error, fallback);
    } catch (error) {
      if (error instanceof AuthFlowError) throw error;
      throw mapSupabaseAuthError(error, fallback);
    }
  };

  return {
    async signInWithMagicLink(email: string) {
      const normalizedEmail = normalizeEmail(email);
      if (!validateAuthEmail(normalizedEmail)) throw new AuthFlowError("invalid_email");

      await completeAuthRequest(() => deps.getClient().auth.signInWithOtp({
        email: normalizedEmail,
        options: { emailRedirectTo: deps.getRedirectUrl() },
      }));
    },

    async registerWithEmailPassword(email: string, password: string) {
      const normalizedEmail = normalizeEmail(email);
      const validationError = validateRegistrationCode({
        confirmPassword: password,
        email: normalizedEmail,
        password,
      });

      if (validationError) {
        throw new AuthFlowError(validationError);
      }

      await completeAuthRequest(() => deps.getClient().auth.signUp({
        email: normalizedEmail,
        password,
        options: { emailRedirectTo: deps.getRedirectUrl("confirmation") },
      }));
    },

    async signInWithEmailPassword(email: string, password: string) {
      const normalizedEmail = normalizeEmail(email);
      const validationError = validateLoginCode({ email: normalizedEmail, password });
      if (validationError) {
        throw new AuthFlowError(validationError);
      }

      await completeAuthRequest(() => deps.getClient().auth.signInWithPassword({
        email: normalizedEmail,
        password,
      }));
    },

    async requestPasswordReset(email: string) {
      const normalizedEmail = normalizeEmail(email);
      const validationError = validatePasswordResetCode(normalizedEmail);
      if (validationError) {
        throw new AuthFlowError(validationError);
      }

      await completeAuthRequest(() => deps.getClient().auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: deps.getRedirectUrl("recovery"),
      }));
    },

    async signInWithGoogle() {
      await completeAuthRequest(() => deps.getClient().auth.signInWithOAuth({
        options: { redirectTo: deps.getRedirectUrl() },
        provider: "google",
      }), "oauth_failure");
    },

    async updatePassword(password: string, confirmPassword: string) {
      const validationError = validatePasswordUpdateCode({ confirmPassword, password });
      if (validationError) {
        throw new AuthFlowError(validationError);
      }

      await completeAuthRequest(() => deps.getClient().auth.updateUser({ password }));
    },
  };
};
