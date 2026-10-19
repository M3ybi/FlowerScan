import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import { AppErrorBoundary } from "../../src/app/AppErrorBoundary";

const parameters = new URLSearchParams(location.search);
localStorage.clear(); sessionStorage.clear();
if (!parameters.has("fresh")) localStorage.setItem("plantie-language-v1", parameters.get("language") ?? "en");
if (parameters.has("signed-in") || parameters.has("legacy-household")) {
  localStorage.setItem("plantie-onboarding-v1", "complete");
  localStorage.setItem("flowscan-active-household-v1", JSON.stringify({ name: "Fixture household", publicToken: "fixture-household-token-12345" }));
}
const originalFetch = window.fetch;
window.fetch = async (input, options) => {
  const url = new URL(input instanceof Request ? input.url : String(input), location.href);
  if (/^(data|blob):$/.test(url.protocol)) return originalFetch(input, options);
  return Response.json({}, { status: ["/plant-state", "/report-settings"].some(path => url.pathname.endsWith(path)) ? 200 : 503 });
};
const observedLegacyScreens: string[] = [];
new MutationObserver(() => {
  for (const element of document.querySelectorAll("#access-title,#language-title,#welcome-title,#household-title")) observedLegacyScreens.push(element.id);
}).observe(document.getElementById("root")!, { childList: true, subtree: true });
Object.assign(window, { __entryFixture: { observedLegacyScreens } });
declare global { interface Window { __entryFixture: { observedLegacyScreens: string[] }; } }
createRoot(document.getElementById("root")!).render(<StrictMode><AppErrorBoundary><App /></AppErrorBoundary></StrictMode>);
