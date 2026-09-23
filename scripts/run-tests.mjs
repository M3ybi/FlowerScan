import { spawnSync } from "node:child_process";

const testScripts = [
  "test:supabase",
  "test:billing",
  "test:diagnostics",
  "test:household",
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
  "test:i18n",
  "test:backend-migration",
  "test:household-invites",
  "test:mobile-ux",
  "test:menu-ux",
  "test:app-helpers",
  "test:product-redesign",
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
