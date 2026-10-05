const nativeAuthBaseUrl = "com.plantie.app://auth";

export const nativeOAuthRedirectUrl = `${nativeAuthBaseUrl}/callback`;
export const nativeConfirmationRedirectUrl = `${nativeAuthBaseUrl}/confirm`;
export const nativeRecoveryRedirectUrl = `${nativeAuthBaseUrl}/recovery`;
export const nativeOAuthSuccessEvent = "planti-native-oauth-success";
export const nativeOAuthErrorEvent = "planti-native-oauth-error";

export type NativeAuthCallbackKind = "oauth" | "confirmation" | "recovery";
export type NativeAuthCallbackResult = {
  kind: NativeAuthCallbackKind;
  status: "completed" | "duplicate";
};

type NativeAuthCallback = {
  code: string;
  flowId?: string;
  kind: NativeAuthCallbackKind;
};

type NativeAuthExchange = (code: string, flowId?: string) => Promise<{ error: unknown | null }>;

export class NativeAuthCallbackError extends Error {
  constructor(public readonly reason: "invalid_link" | "expired_link" | "provider_error" | "exchange_failed") {
    super(
      reason === "expired_link"
        ? "This authentication link has expired. Request a new one."
        : reason === "provider_error"
          ? "Authentication was cancelled or could not be completed."
          : reason === "exchange_failed"
            ? "This authentication link could not be completed. Request a new one."
            : "This authentication link is invalid. Request a new one.",
    );
    this.name = "NativeAuthCallbackError";
  }
}

const singleParameter = (params: URLSearchParams, name: string) => {
  const values = params.getAll(name);
  if (values.length > 1) {
    throw new NativeAuthCallbackError("invalid_link");
  }
  return values[0] ?? null;
};

const singleCallbackParameter = (query: URLSearchParams, fragment: URLSearchParams, name: string) => {
  const queryValue = singleParameter(query, name);
  const fragmentValue = singleParameter(fragment, name);
  if (queryValue !== null && fragmentValue !== null) {
    throw new NativeAuthCallbackError("invalid_link");
  }
  return queryValue ?? fragmentValue;
};

export const parseNativeAuthCallback = (url: string): NativeAuthCallback | null => {
  let callbackUrl: URL;
  try {
    callbackUrl = new URL(url);
  } catch {
    return null;
  }

  if (
    callbackUrl.protocol !== "com.plantie.app:" ||
    callbackUrl.hostname !== "auth" ||
    callbackUrl.username ||
    callbackUrl.password ||
    callbackUrl.port
  ) {
    return null;
  }

  let kind: NativeAuthCallbackKind;
  switch (callbackUrl.pathname) {
    case "/callback":
      kind = "oauth";
      break;
    case "/confirm":
      kind = "confirmation";
      break;
    case "/recovery":
      kind = "recovery";
      break;
    default:
      return null;
  }

  const query = callbackUrl.searchParams;
  const fragment = new URLSearchParams(callbackUrl.hash.slice(1));
  const errorCode = singleCallbackParameter(query, fragment, "error");
  const errorReason = singleCallbackParameter(query, fragment, "error_code");
  const errorDescription = singleCallbackParameter(query, fragment, "error_description");
  if (errorCode || errorReason || errorDescription) {
    throw new NativeAuthCallbackError(errorReason === "otp_expired" ? "expired_link" : "provider_error");
  }

  // Older redirect templates may preserve `type` on /callback. Dedicated paths
  // remain authoritative for newly issued links.
  const type = singleCallbackParameter(query, fragment, "type");
  if (callbackUrl.pathname === "/callback" && type === "recovery") {
    kind = "recovery";
  } else if (callbackUrl.pathname === "/callback" && type === "signup") {
    kind = "confirmation";
  } else if ((kind === "recovery" && type === "signup") || (kind === "confirmation" && type === "recovery")) {
    throw new NativeAuthCallbackError("invalid_link");
  }

  const code = singleParameter(query, "code");
  const flowId = singleParameter(query, "sb_flow_id");
  if (!code || code.length > 4096 || /[\u0000-\u001f\u007f]/.test(code)) {
    throw new NativeAuthCallbackError("invalid_link");
  }
  if (flowId !== null && (!flowId || flowId.length > 512 || /[\u0000-\u001f\u007f]/.test(flowId))) {
    throw new NativeAuthCallbackError("invalid_link");
  }

  return { code, flowId: flowId ?? undefined, kind };
};

// Register one handler for both appUrlOpen and getLaunchUrl. Capacitor can emit
// the same callback through both APIs during a cold start.
export const createNativeAuthCallbackHandler = (exchangeCode: NativeAuthExchange) => {
  const inFlight = new Map<string, Promise<NativeAuthCallbackResult>>();
  const completed = new Map<string, NativeAuthCallbackKind>();

  return async (url: string): Promise<NativeAuthCallbackResult | null> => {
    const callback = parseNativeAuthCallback(url);
    if (!callback) {
      return null;
    }

    const completedKind = completed.get(callback.code);
    if (completedKind) {
      if (completedKind !== callback.kind) {
        throw new NativeAuthCallbackError("invalid_link");
      }
      return { kind: completedKind, status: "duplicate" };
    }

    const pending = inFlight.get(callback.code);
    if (pending) {
      const result = await pending;
      if (result.kind !== callback.kind) {
        throw new NativeAuthCallbackError("invalid_link");
      }
      return { kind: result.kind, status: "duplicate" };
    }

    const task = (async (): Promise<NativeAuthCallbackResult> => {
      try {
        const { error } = await exchangeCode(callback.code, callback.flowId);
        if (error) {
          throw error;
        }
      } catch {
        throw new NativeAuthCallbackError("exchange_failed");
      }

      completed.set(callback.code, callback.kind);
      if (completed.size > 20) {
        completed.delete(completed.keys().next().value!);
      }
      return { kind: callback.kind, status: "completed" };
    })();

    inFlight.set(callback.code, task);
    try {
      return await task;
    } finally {
      inFlight.delete(callback.code);
    }
  };
};
