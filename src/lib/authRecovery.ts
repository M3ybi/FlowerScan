import { AuthFlowError } from "./authRules.js";

export type AuthRecoveryClient = {
  auth: {
    signOut(options: { scope: "local" }): Promise<{ error: unknown }>;
    getSession(): Promise<{ error: unknown; data: { session: unknown | null } }>;
  };
};

/** Closing recovery is separate from updating a password: retries must never update it twice. */
export const createPasswordRecoveryCleanup = (getClient: () => AuthRecoveryClient) => {
  let pending: Promise<void> | null = null;
  return (): Promise<void> => {
    if (pending) return pending;
    const request = Promise.resolve().then(async () => {
      const client = getClient();
      const result = await client.auth.signOut({ scope: "local" });
      if (result.error) throw new AuthFlowError("recovery_cleanup_failed");
      const session = await client.auth.getSession();
      if (session.error || session.data.session !== null) throw new AuthFlowError("recovery_cleanup_failed");
    }).catch(() => {
      // The password may already have changed. Do not report an update failure or expose provider data.
      throw new AuthFlowError("recovery_cleanup_failed");
    }).finally(() => {
      if (pending === request) pending = null;
    });
    pending = request;
    return request;
  };
};
