export type AuthMode = "register" | "login" | "reset" | "updatePassword";

export const minimumAuthPasswordLength = 8;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateAuthEmail = (email: string) => emailPattern.test(email.trim());

export const validateAuthPassword = (password: string) => password.length >= minimumAuthPasswordLength;

export const validateRegistrationInput = ({
  confirmPassword,
  email,
  password,
}: {
  confirmPassword: string;
  email: string;
  password: string;
}) => {
  if (!validateAuthEmail(email)) {
    return "Enter a valid email address.";
  }

  if (!validateAuthPassword(password)) {
    return `Password must be at least ${minimumAuthPasswordLength} characters.`;
  }

  if (password !== confirmPassword) {
    return "Passwords do not match.";
  }

  return null;
};

export const validateLoginInput = ({ email, password }: { email: string; password: string }) => {
  if (!validateAuthEmail(email)) {
    return "Enter a valid email address.";
  }

  if (!password) {
    return "Enter your password.";
  }

  return null;
};

export const validatePasswordResetInput = (email: string) =>
  validateAuthEmail(email) ? null : "Enter a valid email address.";

export const validatePasswordUpdateInput = ({
  confirmPassword,
  password,
}: {
  confirmPassword: string;
  password: string;
}) => {
  if (!validateAuthPassword(password)) {
    return `Password must be at least ${minimumAuthPasswordLength} characters.`;
  }

  if (password !== confirmPassword) {
    return "Passwords do not match.";
  }

  return null;
};

export const createAuthRedirectUrl = (currentUrl: string | undefined) => {
  if (!currentUrl) {
    return undefined;
  }

  try {
    const url = new URL(currentUrl);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
};

const authErrorMessage = (error: unknown, fallback: string) => {
  if (!error || typeof error !== "object") {
    return fallback;
  }

  const message = "message" in error && typeof error.message === "string" ? error.message.toLowerCase() : "";
  const code = "code" in error && typeof error.code === "string" ? error.code.toLowerCase() : "";
  const status = "status" in error && typeof error.status === "number" ? error.status : null;

  if (status === 429 || code.includes("rate_limit") || message.includes("rate limit")) {
    return "Too many auth emails were requested. Wait a few minutes, then request the latest email only once.";
  }

  if (message.includes("email not confirmed") || message.includes("email_not_confirmed")) {
    return "Confirm your email address first, then try signing in again. If the email is old, create a new account request to receive a fresh confirmation link.";
  }

  if (message.includes("invalid login credentials")) {
    return "Sign-in failed. The email exists, but the password does not match. Use Reset password or the current temporary password.";
  }

  if (message.includes("expired") || message.includes("otp")) {
    return "The confirmation link is no longer valid. Request a new email and use the latest link.";
  }

  return fallback;
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
  getRedirectUrl: () => string | undefined;
}) => {
  const normalizeEmail = (email: string) => email.trim().toLowerCase();

  return {
    async signInWithMagicLink(email: string) {
      const normalizedEmail = normalizeEmail(email);
      if (!validateAuthEmail(normalizedEmail)) {
        throw new Error("Enter a valid email address.");
      }

      const { error } = await deps.getClient().auth.signInWithOtp({
        email: normalizedEmail,
        options: { emailRedirectTo: deps.getRedirectUrl() },
      });

      if (error) {
        throw new Error(authErrorMessage(error, "Sign-in email could not be sent."));
      }
    },

    async registerWithEmailPassword(email: string, password: string) {
      const normalizedEmail = normalizeEmail(email);
      const validationError = validateRegistrationInput({
        confirmPassword: password,
        email: normalizedEmail,
        password,
      });

      if (validationError) {
        throw new Error(validationError);
      }

      const { error } = await deps.getClient().auth.signUp({
        email: normalizedEmail,
        password,
        options: { emailRedirectTo: deps.getRedirectUrl() },
      });

      if (error) {
        throw new Error(authErrorMessage(error, "Account could not be created. Check your details and try again."));
      }
    },

    async signInWithEmailPassword(email: string, password: string) {
      const normalizedEmail = normalizeEmail(email);
      const validationError = validateLoginInput({ email: normalizedEmail, password });
      if (validationError) {
        throw new Error(validationError);
      }

      const { error } = await deps.getClient().auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        throw new Error(authErrorMessage(error, "Sign-in failed. Check your email and password."));
      }
    },

    async requestPasswordReset(email: string) {
      const normalizedEmail = normalizeEmail(email);
      const validationError = validatePasswordResetInput(normalizedEmail);
      if (validationError) {
        throw new Error(validationError);
      }

      const { error } = await deps.getClient().auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: deps.getRedirectUrl(),
      });

      if (error) {
        throw new Error(authErrorMessage(error, "Password reset email could not be sent."));
      }
    },

    async signInWithGoogle() {
      const { error } = await deps.getClient().auth.signInWithOAuth({
        options: { redirectTo: deps.getRedirectUrl() },
        provider: "google",
      });

      if (error) {
        throw new Error(authErrorMessage(error, "Google sign-in could not be started."));
      }
    },

    async updatePassword(password: string, confirmPassword: string) {
      const validationError = validatePasswordUpdateInput({ confirmPassword, password });
      if (validationError) {
        throw new Error(validationError);
      }

      const { error } = await deps.getClient().auth.updateUser({ password });
      if (error) {
        throw new Error(authErrorMessage(error, "Password could not be updated. Request a new reset email and try again."));
      }
    },
  };
};
