type LifecycleEvent = {
  type: string;
  expirationAtMs: number | null;
  gracePeriodExpirationAtMs?: number | null;
  eventOccurredAtMs?: number | null;
  cancelReason?: string;
};

export const getRevenueCatAccessExpiration = (event: LifecycleEvent) => {
  if (event.type === "BILLING_ISSUE" || (event.type === "CANCELLATION" && event.cancelReason === "BILLING_ERROR")) {
    const graceEnd = event.gracePeriodExpirationAtMs;
    if (graceEnd != null && graceEnd > (event.expirationAtMs ?? 0)) return graceEnd;
  }
  return event.expirationAtMs;
};

// A refund cancellation may retain access (refund without revocation). Revoke
// only when the provider also supplies an effective end at/before this event.
export const isRevenueCatRefundRevocation = (event: LifecycleEvent) =>
  event.type === "CANCELLATION" && event.cancelReason === "CUSTOMER_SUPPORT" &&
  event.expirationAtMs !== null && event.eventOccurredAtMs != null &&
  event.expirationAtMs <= event.eventOccurredAtMs;
