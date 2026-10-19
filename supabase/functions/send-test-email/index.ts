import { observeOperation } from "../_shared/observability.ts";
import { Resend } from "npm:resend";
import { requireUser } from "../_shared/auth.ts";
import { corsHeaders, json } from "../_shared/cors.ts";

const defaultFromEmail = "onboarding@resend.dev";

Deno.serve(observeOperation("operator_email", async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders, status: 204 });
  if (request.method !== "POST") return json(405, { message: "Use POST to send a test email." });

  if (Deno.env.get("ENABLE_TEST_EMAIL") !== "true") return json(404, { message: "Not found." });

  const auth = await requireUser(request.headers.get("authorization") ?? "");
  if (!auth) {
    return json(401, { message: "Sign in before sending a test email." });
  }

  const operators = (Deno.env.get("TEST_EMAIL_OPERATOR_IDS") ?? "").split(",").map(value => value.trim()).filter(Boolean);
  if (!operators.includes(auth.user.id)) return json(403, { message: "Operator access required." });
  const { error: limitError } = await auth.client.rpc("admit_image_operation", { requested_operation: "test_email" });
  if (limitError) return json(429, { message: "Test email is temporarily unavailable." });

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    return json(500, { message: "RESEND_API_KEY is not configured." });
  }

  const resend = new Resend(apiKey);
  const from = Deno.env.get("RESEND_FROM_EMAIL") || defaultFromEmail;
  const to = Deno.env.get("RESEND_TEST_EMAIL");

  if (!to) return json(503, { message: "Test recipient is not configured." });

  try {
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject: "Hello World",
      html: "<p>Congrats on sending your <strong>first email</strong>!</p>",
    });

    if (error) return json(502, { message: "Resend could not send the test email." });

    return json(202, { id: data?.id ?? null, message: "Test email sent." });
  } catch { return json(502, { message: "Test email could not be sent." }); }
}));
