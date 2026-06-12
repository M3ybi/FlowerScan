import { Resend } from "npm:resend";
import { requireUser } from "../_shared/auth.ts";
import { corsHeaders, json } from "../_shared/cors.ts";

const defaultFromEmail = "onboarding@resend.dev";
const defaultTestRecipient = "fedorcor28@gmail.com";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders, status: 204 });
  if (request.method !== "POST") return json(405, { message: "Use POST to send a test email." });

  const auth = await requireUser(request.headers.get("authorization") ?? "");
  if (!auth) {
    return json(401, { message: "Sign in before sending a test email." });
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    return json(500, { message: "RESEND_API_KEY is not configured." });
  }

  const resend = new Resend(apiKey);
  const from = Deno.env.get("RESEND_FROM_EMAIL") || defaultFromEmail;
  const to = Deno.env.get("RESEND_TEST_EMAIL") || defaultTestRecipient;

  const { data, error } = await resend.emails.send({
    from,
    to,
    subject: "Hello World",
    html: "<p>Congrats on sending your <strong>first email</strong>!</p>",
  });

  if (error) {
    return json(502, { message: "Resend could not send the test email.", providerError: error });
  }

  return json(202, { id: data?.id ?? null, message: "Test email sent." });
});
