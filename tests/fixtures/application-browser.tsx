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
const parameters = new URLSearchParams(location.search);
localStorage.clear();
localStorage.setItem("plantie-language-v1", parameters.get("language") ?? "en");
localStorage.setItem("plantie-onboarding-v1", "complete");
localStorage.setItem("flowscan-active-household-v1", JSON.stringify({ name: "Fixture household", publicToken: parameters.has("qr") ? "33333333-3333-4333-8333-333333333333" : "fixture-household-token-12345" }));
localStorage.setItem("flowscan-custom-flowers-v1", JSON.stringify(parameters.has("qr") && parameters.has("empty") ? [] : [plant]));
localStorage.setItem("flowscan-removed-flower-ids-v1", JSON.stringify(flowers.map(value => value.id)));
window.__entryFixtureAuth.setAuthenticated(true);
const calls: Record<string, number> = {};
const originalFetch = window.fetch;
window.fetch = async (input, options) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (/^(data|blob):/.test(url)) return originalFetch(input, options);
  const operation = new URL(url, location.href).pathname.split("/").pop()!;
  calls[operation] = (calls[operation] ?? 0) + 1;
  if (parameters.has("qr")) {
    if (operation === "list_my_households") return Response.json(["33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"].map((id, index) => ({
      id, name: index === 0 ? "Fixture household" : "Second fixture household", legacy_public_token: null, created_by: "11111111-1111-4111-8111-111111111111",
      created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    })));
    if (operation === "get_household_entitlement") return Response.json({ plan_key: "free", is_premium: false, status: "active", valid_until: null,
      max_members: 1, invitations_enabled: false, active_member_count: 1, pending_invite_count: 0, suspended_member_count: 0, role: "owner" });
    if (operation === "is_household_billing_bound") return Response.json(false);
    if (operation === "get_household_plan_usage") return Response.json([{ ai_analyzes_monthly_limit: 10, ai_analyzes_remaining: 10, ai_analyzes_used: 0,
      is_premium: false, period_end: null, period_start: null, plants_limit: 10, plants_remaining: 9, plants_used: 1 }]);
  }
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
