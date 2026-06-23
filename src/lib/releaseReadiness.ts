export type LegalPageId = "privacy" | "terms" | "support" | "delete-account" | "subscription-terms";

export type LegalPage = {
  id: LegalPageId;
  path: string;
  title: string;
  summary: string;
  sections: Array<{
    heading: string;
    body: string[];
  }>;
};

export type ReleaseEnvSnapshot = {
  viteSupabaseUrl?: string;
  viteSupabaseAnonKey?: string;
  viteRevenueCatIosKey?: string;
  viteRevenueCatAndroidKey?: string;
};

export type ReleaseHealthCheck = {
  key: string;
  label: string;
  ok: boolean;
};

export const legalPages: LegalPage[] = [
  {
    id: "privacy",
    path: "#/privacy",
    title: "Privacy Policy",
    summary: "How Plantie handles account, plant, household, AI, and subscription data.",
    sections: [
      {
        heading: "Data we process",
        body: [
          "Plantie may process account identifiers, email addresses, household membership, plant names, care records, report settings, and app diagnostics needed to operate the service.",
          "Plant photos and AI diagnosis images are processed when you choose to upload or capture them. Images are validated before upload and private Supabase paths are stored instead of permanent signed URLs.",
        ],
      },
      {
        heading: "Service providers",
        body: [
          "Supabase stores authenticated account, household, plant, Premium access, and private image storage data.",
          "OpenAI may process plant photos, diagnosis images, symptoms, and care prompts to generate informational AI outputs.",
          "RevenueCat processes subscription status and store purchase events when mobile subscriptions are enabled.",
        ],
      },
      {
        heading: "Sharing and notifications",
        body: [
          "Household sharing lets invited household members access shared plant data for that household.",
          "Email reports are sent only when configured. Push notifications are planned and will require explicit platform permissions before use.",
        ],
      },
      {
        heading: "Deletion",
        body: [
          "You can request account deletion from the Delete Account page. Until direct deletion is fully automated, Plantie uses a manual review process to prevent accidental household or shared-data loss.",
        ],
      },
    ],
  },
  {
    id: "terms",
    path: "#/terms",
    title: "Terms of Service",
    summary: "Rules for using Plantie and its AI-assisted plant care features.",
    sections: [
      {
        heading: "Informational AI",
        body: [
          "AI diagnosis and care guidance are informational only. Plantie does not provide medical, safety, legal, veterinary, agricultural, or professional guarantees.",
          "You are responsible for checking AI outputs before acting on them, especially where plant toxicity, pests, mold, chemicals, food crops, children, or pets may be involved.",
        ],
      },
      {
        heading: "Subscriptions",
        body: [
          "When enabled, mobile subscriptions are managed by the App Store or Google Play. Premium access is confirmed by Plantie after secure server validation.",
        ],
      },
      {
        heading: "Uploaded content",
        body: [
          "You are responsible for photos, notes, plant names, and other content you upload. Do not upload unlawful, abusive, private third-party, or harmful content.",
        ],
      },
      {
        heading: "Acceptable use",
        body: [
          "Do not misuse the service, probe private data, bypass access controls, overload backend systems, or attempt to reverse engineer payment or Premium access checks.",
        ],
      },
    ],
  },
  {
    id: "support",
    path: "#/support",
    title: "Support",
    summary: "How beta users can get help with Plantie.",
    sections: [
      {
        heading: "Contact",
        body: [
          "For beta support, include your device platform, app version, whether you are signed in, and a short description of the issue.",
          "Do not send secrets, household invite tokens, receipts, or raw image payloads in support messages.",
        ],
      },
      {
        heading: "Known beta limits",
        body: [
          "Real App Store and Google Play subscription products are not configured yet. Web purchases remain disabled.",
          "Google Play identity verification and Apple Developer Program enrollment are still external release blockers.",
        ],
      },
    ],
  },
  {
    id: "delete-account",
    path: "#/delete-account",
    title: "Delete Account",
    summary: "Request account deletion without accidentally removing shared household data.",
    sections: [
      {
        heading: "What happens",
        body: [
          "A deletion request starts a manual review. This prevents accidental deletion of shared household records before ownership and household membership are checked.",
          "The placeholder endpoint records no destructive action and does not delete Supabase, RevenueCat, Netlify, or storage data automatically.",
        ],
      },
      {
        heading: "Manual process",
        body: [
          "Verify the requester identity, review household ownership, export any legally required records, remove or transfer household membership, delete private storage objects where appropriate, then remove the Supabase user and related Premium access records.",
        ],
      },
    ],
  },
  {
    id: "subscription-terms",
    path: "#/subscription-terms",
    title: "Subscription Terms",
    summary: "Premium subscription terms prepared for mobile store review.",
    sections: [
      {
        heading: "Premium",
        body: [
          "Premium is planned for AI diagnosis and related paid features. Real purchases are unavailable until App Store Connect and Google Play products are configured.",
          "When enabled, purchases, renewals, cancellations, refunds, and billing issues are managed by the App Store or Google Play and synchronized through RevenueCat webhooks.",
        ],
      },
      {
        heading: "Access",
        body: [
          "Client-side RevenueCat results do not grant Premium. Plantie grants Premium only after validated server-side webhook processing updates secure Premium access state.",
        ],
      },
    ],
  },
];

export const legalPageById = new Map(legalPages.map((page) => [page.id, page]));

export const storeMetadata = {
  shortDescription: "Plant care, AI diagnosis, QR labels, and household sharing in one private plant tracker.",
  longDescription:
    "Plantie helps households track plants, watering, care notes, AI-assisted plant diagnosis, QR labels, and optional premium features. It supports private household sharing, Supabase-backed authenticated storage, and mobile camera capture while keeping web usage available.",
  keywords: ["plant care", "houseplants", "watering", "AI diagnosis", "plant tracker", "QR labels", "household sharing"],
  features: [
    "Private plant household tracking",
    "AI-assisted plant care generation and diagnosis",
    "Camera and gallery image capture on mobile",
    "QR labels for individual plants",
    "Email report support",
    "Server-backed Premium access model",
  ],
  changelogTemplate: ["Added release compliance pages.", "Added safe health diagnostics.", "Prepared mobile store metadata and asset checklist."],
  betaTesterInstructions: [
    "Create or open a household.",
    "Add a custom plant with a photo.",
    "Run an AI diagnosis from a plant detail page.",
    "Generate QR labels.",
    "Report platform, device, login state, and steps for any issue.",
  ],
};

export const productionReadinessChecklist = [
  "Complete Google Play identity verification.",
  "Enroll in the Apple Developer Program.",
  "Configure App Store Connect and Google Play subscription products later.",
  "Create RevenueCat offerings for plantie_premium_monthly and plantie_premium_yearly after store products exist.",
  "Confirm Supabase RLS, private storage buckets, and webhook service-role env vars in production.",
  "Set Netlify env vars for Supabase, OpenAI, RevenueCat webhook, email, push, and public Vite config.",
  "Prepare app icon, splash screen, feature graphic, and phone/tablet screenshots.",
  "Complete Apple privacy nutrition labels and Google Play Data safety answers.",
];

export const storeAssetChecklist = [
  "App icon source at 1024x1024 PNG, no transparency for iOS.",
  "Android adaptive icon foreground and background assets.",
  "Splash screen assets for iOS and Android.",
  "Google Play feature graphic 1024x500.",
  "Phone screenshots for iPhone and Android.",
  "Tablet screenshots if tablet support remains enabled.",
  "Screenshot set covering dashboard, plant detail, diagnosis, QR labels, account, and legal/support pages.",
];

export const securityReviewChecklist = [
  "No server-only Supabase or webhook secret environment variables are referenced in frontend code.",
  "RevenueCat webhook rejects missing config and invalid secrets.",
  "Premium access is derived from secure Supabase Premium state, not local RevenueCat customer info.",
  "Image capture validates MIME type and size before processing.",
  "Private image storage stores paths only and uses short-lived signed URLs.",
  "Logs avoid secrets, receipts, auth headers, raw images, and full webhook payloads.",
];

export const getReleaseHealthChecks = (env: ReleaseEnvSnapshot): ReleaseHealthCheck[] => [
  { key: "supabase-url", label: "VITE_SUPABASE_URL configured", ok: Boolean(env.viteSupabaseUrl) },
  { key: "supabase-anon", label: "VITE_SUPABASE_ANON_KEY configured", ok: Boolean(env.viteSupabaseAnonKey) },
  {
    key: "revenuecat-ios",
    label: "VITE_REVENUECAT_API_KEY_IOS configured for native billing",
    ok: Boolean(env.viteRevenueCatIosKey),
  },
  {
    key: "revenuecat-android",
    label: "VITE_REVENUECAT_API_KEY_ANDROID configured for native billing",
    ok: Boolean(env.viteRevenueCatAndroidKey),
  },
];

export const summarizeReleaseHealth = (checks: ReleaseHealthCheck[]) => ({
  missing: checks.filter((check) => !check.ok).map((check) => check.key),
  ok: checks.every((check) => check.ok),
});

export const healthPayloadContainsSecretLikeValue = (payload: unknown) =>
  /service_role|webhook_secret|authorization|bearer|receipt|customer_info/i.test(JSON.stringify(payload));
