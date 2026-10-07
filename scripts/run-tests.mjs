import { spawnSync } from "node:child_process";

const testScripts = [
  "test:supabase",
  "test:billing",
  "test:subscription-state",
  "test:subscription-ui",
  "test:billing-history-ui",
  "test:subscription-history",
  "test:diagnostics",
  "test:household",
  "test:legacy-backend-guard",
  "test:household-plan",
  "test:notifications",
  "test:qr",
  "test:migration",
  "test:read-through",
  "test:source-of-truth",
  "test:image",
  "test:release-readiness",
  "test:onboarding",
  "test:auth-ux",
  "test:auth-service-flow",
  "test:auth-panel-ui",
  "test:native-auth",
  "test:i18n",
  "test:backend-migration",
  "test:household-invites",
  "test:household-invite-email",
  "test:household-people",
  "test:household-invitation-recipient",
  "test:auth-email-hook",
  "test:household-membership",
  "test:household-permissions",
  "test:mobile-ux",
  "test:menu-ux",
  "test:logged-out-menu-facts",
  "test:app-helpers",
  "test:product-redesign",
  "test:care-presentation",
  "test:revenuecat-webhook",
];

const runNpmScript = (script) => {
  if (process.platform === "win32") {
    return spawnSync("cmd.exe", ["/d", "/s", "/c", `npm run ${script}`], { stdio: "inherit" });
  }

  return spawnSync("npm", ["run", script], { stdio: "inherit" });
};

for (const script of testScripts) {
  console.log(`\n> npm run ${script}`);
  const result = runNpmScript(script);

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
