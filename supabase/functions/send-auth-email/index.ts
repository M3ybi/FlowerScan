import { Webhook } from "npm:standardwebhooks@1.0.0";
import { createAuthEmailHookHandler } from "../_shared/authEmail.ts";

const signingSecret = Deno.env.get("SEND_EMAIL_HOOK_SECRET")?.replace(/^v1,whsec_/, "");
const apiKey = Deno.env.get("RESEND_API_KEY");
const from = Deno.env.get("RESEND_AUTH_FROM_EMAIL") ?? Deno.env.get("RESEND_FROM_EMAIL");

// Auth hooks do not carry a user JWT. Every payload must pass Standard Webhooks
// signature and timestamp verification before recipients or tokens are trusted.
Deno.serve(createAuthEmailHookHandler({
  configured: Boolean(signingSecret && apiKey),
  sender: from,
  supabaseUrl: Deno.env.get("SUPABASE_URL"),
  publicUrl: Deno.env.get("APP_PUBLIC_URL"),
  verify: (payload, headers) => new Webhook(signingSecret!).verify(payload, headers),
  send: async (email, idempotencyKey) => {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ from, ...email }),
      signal: AbortSignal.timeout(4000),
    });
    // Provider messages may contain addresses or tokens. Retain only the provider ID.
    let providerMessageId: string | undefined;
    if (response.ok) {
      const result = await response.json().catch(() => null);
      if (typeof result?.id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(result.id)) providerMessageId = result.id;
    }
    return { ok: response.ok, status: response.status, providerMessageId };
  },
  diagnostic: (event) => console.info("Plantie authentication email", event),
}));
