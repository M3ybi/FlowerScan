import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.plantie.app",
  appName: "Plantie",
  webDir: "dist",
  // Native bridge events can contain one-time auth codes in callback URLs.
  loggingBehavior: "none",
};

export default config;
