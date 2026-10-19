import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import { AppErrorBoundary } from "../../src/app/AppErrorBoundary";
import { flowers, type Flower } from "../../src/data/flowers";
import { PricingPage } from "../../src/components/PricingPage";
import { UpgradeModal } from "../../src/components/UpgradeModal";
import type { SubscriptionSnapshot } from "../../src/lib/subscriptionState";
import type { GeneratedCare } from "../../src/utils/customFlower";

const canvas = document.createElement("canvas");
canvas.width = 100; canvas.height = 60;
canvas.getContext("2d")!.fillStyle = "#397b53";
canvas.getContext("2d")!.fillRect(0, 0, 100, 60);
const image = canvas.toDataURL("image/jpeg");
const care: GeneratedCare = { displayName: "Fixture plant", likelyName: "Monstera deliciosa", identificationConfidence: "likely",
  shortCare: "Bright indirect light.", carePills: [{ label: "Light", value: "Indirect", tone: "green" }],
  light: "Indirect light", watering: "After drying", wateringIntervalDays: 7, soil: "Draining soil",
  careTips: ["Check soil", "Rotate", "Keep warm"], identificationNote: "Fixture only" };
const plant: Flower = { ...care, identification: "likely", image, id: "fixture-plant", source: "custom" };
localStorage.clear();
localStorage.setItem("plantie-language-v1", "en");
localStorage.setItem("plantie-onboarding-v1", "complete");
localStorage.setItem("flowscan-active-household-v1", JSON.stringify({ name: "Fixture household", publicToken: "fixture-household-token-12345" }));
localStorage.setItem("flowscan-custom-flowers-v1", JSON.stringify([plant]));
localStorage.setItem("flowscan-removed-flower-ids-v1", JSON.stringify(flowers.map(value => value.id)));
window.__entryFixtureAuth.setAuthenticated(true);
const calls: Record<string, number> = {};
const originalFetch = window.fetch;
window.fetch = async (input, options) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (/^(data|blob):/.test(url)) return originalFetch(input, options);
  const operation = new URL(url, location.href).pathname.split("/").pop()!;
  calls[operation] = (calls[operation] ?? 0) + 1;
  if (operation === "report-settings" || operation === "plant-state") return Response.json({});
  if (operation === "validate-plant-image") return Response.json({ validation: { containsPlant: true, plantConfidence: 1,
    hasSensitiveBackground: false, hasExplicitOrUnsafeContent: false, hasRestrictedFootageOrPrivateContent: false,
    shouldAllowUpload: true, failureReasons: [], safeUserMessage: "" } });
  if (operation === "plant-care-ai") {
    const body = JSON.parse(String(options?.body));
    return Response.json({ care: { ...care, displayName: body.plantName } });
  }
  return Response.json({ message: "Offline fixture boundary" }, { status: 503 });
};
window.confirm = () => true;
const subscription: SubscriptionSnapshot = { status: "ready", view: "free", userId: "fixture-user", householdId: "fixture-home",
  householdPlanUsage: null, error: null, customerInfo: { activeEntitlements: [], activePlan: null, appUserId: "fixture-user",
    expiresAt: null, hasRevenueCatPremium: false, managementUrl: null, productId: null, willRenew: null }, householdEntitlement: { planKey: "free", isPremium: false,
    status: "active", validUntil: null, maxMembers: 1, invitationsEnabled: false, activeMemberCount: 1,
    pendingInviteCount: 0, suspendedMemberCount: 0, role: "owner", billingBoundHere: false } };
let root = createRoot(document.getElementById("root")!);
const fixture = { image, calls, purchaseCalls: 0, beginCalls: 0, releasePurchase: () => {},
  showPurchase(kind: string) { root.unmount(); root = createRoot(document.getElementById("root")!);
    const props = { subscription, language: "en" as const, onSubscriptionChanged: async () => subscription };
    root.render(kind === "pricing" ? <PricingPage {...props} /> : <UpgradeModal {...props} onClose={() => {}} />);
  },
  unmount() { root.unmount(); },
};
Object.assign(window, { __applicationFixture: fixture });
declare global { interface Window { __applicationFixture: typeof fixture; } }
root.render(<StrictMode><AppErrorBoundary><App /></AppErrorBoundary></StrictMode>);
