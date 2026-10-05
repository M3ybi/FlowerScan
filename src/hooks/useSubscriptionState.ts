import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { getBillingService } from "../lib/billingService";
import { getHouseholdEntitlement, getHouseholdPlanUsage } from "../lib/householdPlanService";
import { createSubscriptionStateController, emptySubscriptionSnapshot } from "../lib/subscriptionState";

export const useSubscriptionState = (userId: string | null, householdId: string | null) => {
  const [snapshot, setSnapshot] = useState(() => emptySubscriptionSnapshot());
  const mountedRef = useRef(false);
  const controllerRef = useRef<ReturnType<typeof createSubscriptionStateController> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createSubscriptionStateController({
      getCustomerInfo: (forceProviderRefresh) => getBillingService().getCustomerInfo(forceProviderRefresh),
      getHouseholdPlanUsage,
      getHouseholdEntitlement,
      onChange: (nextSnapshot) => {
        if (mountedRef.current) setSnapshot(nextSnapshot);
      },
    });
  }
  const controller = controllerRef.current;
  const refreshSubscriptionState = useCallback(() => controller.refresh(true), [controller]);

  useEffect(() => {
    mountedRef.current = true;
    controller.bind(userId, householdId);
    return () => {
      mountedRef.current = false;
      controller.bind(null, null);
    };
  }, [controller, userId, householdId]);

  useEffect(() => {
    if (!userId || !householdId) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "hidden") void refreshSubscriptionState();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const interval = window.setInterval(refreshWhenVisible, 60_000);

    let nativeListener: { remove(): Promise<void> } | null = null;
    let disposed = false;
    if (Capacitor.isNativePlatform()) {
      void import("@capacitor/app").then(({ App }) => App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) void refreshSubscriptionState();
      })).then((listener) => {
        if (disposed) void listener.remove();
        else nativeListener = listener;
      }).catch(() => undefined);
    }
    return () => {
      disposed = true;
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.clearInterval(interval);
      void nativeListener?.remove();
    };
  }, [householdId, refreshSubscriptionState, userId]);

  const currentSnapshot = snapshot.userId === userId && snapshot.householdId === householdId
    ? snapshot
    : emptySubscriptionSnapshot(userId, householdId);
  return { subscription: currentSnapshot, refreshSubscriptionState };
};
