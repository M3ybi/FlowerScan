import { createServiceClient, requireUser } from "../_shared/auth.ts";
import { corsHeaders, json } from "../_shared/cors.ts";

const rejectionMessage =
  "Image contains sensitive/explicit information or does not contain a valid plant/tree. Please upload a clear plant image without sensitive background content.";

type ImageKind = "diagnostic" | "plant";

type ValidationPayload = {
  containsPlant: boolean;
  failureReasons: string[];
  hasExplicitOrUnsafeContent: boolean;
  hasRestrictedFootageOrPrivateContent: boolean;
  hasSensitiveBackground: boolean;
  plantConfidence: number;
  safeUserMessage: string;
  shouldAllowUpload: boolean;
};

const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const validationSchema = {
  additionalProperties: false,
  properties: {
    containsPlant: { type: "boolean" },
    plantConfidence: { maximum: 1, minimum: 0, type: "number" },
    hasSensitiveBackground: { type: "boolean" },
    hasExplicitOrUnsafeContent: { type: "boolean" },
    hasRestrictedFootageOrPrivateContent: { type: "boolean" },
    shouldAllowUpload: { type: "boolean" },
    failureReasons: { items: { type: "string" }, type: "array" },
    safeUserMessage: { type: "string" },
  },
  required: [
    "containsPlant",
    "plantConfidence",
    "hasSensitiveBackground",
    "hasExplicitOrUnsafeContent",
    "hasRestrictedFootageOrPrivateContent",
    "shouldAllowUpload",
    "failureReasons",
    "safeUserMessage",
  ],
  type: "object",
};

const extractOutputText = (response: unknown) => {
  const outputText = (response as { output_text?: unknown }).output_text;
  if (typeof outputText === "string") return outputText;
  const output = (response as { output?: unknown[] }).output;
  if (!Array.isArray(output)) return "";
  for (const item of output) {
    const content = (item as { content?: unknown[] }).content;
    if (!Array.isArray(content)) continue;
    for (const contentItem of content) {
      const text = (contentItem as { text?: unknown }).text;
      if (typeof text === "string") return text;
    }
  }
  return "";
};

const isValidationPayload = (value: unknown): value is ValidationPayload => {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<ValidationPayload>;
  return (
    typeof payload.containsPlant === "boolean" &&
    typeof payload.plantConfidence === "number" &&
    Number.isFinite(payload.plantConfidence) &&
    typeof payload.hasSensitiveBackground === "boolean" &&
    typeof payload.hasExplicitOrUnsafeContent === "boolean" &&
    typeof payload.hasRestrictedFootageOrPrivateContent === "boolean" &&
    typeof payload.shouldAllowUpload === "boolean" &&
    Array.isArray(payload.failureReasons) &&
    payload.failureReasons.every((item) => typeof item === "string") &&
    typeof payload.safeUserMessage === "string"
  );
};

const isAllowed = (payload: ValidationPayload) =>
  payload.containsPlant === true &&
  payload.plantConfidence >= 0.75 &&
  payload.hasSensitiveBackground === false &&
  payload.hasExplicitOrUnsafeContent === false &&
  payload.hasRestrictedFootageOrPrivateContent === false &&
  payload.shouldAllowUpload === true &&
  payload.failureReasons.length === 0;

const parseDataUrl = (imageDataUrl: string) => {
  const match = imageDataUrl.match(/^data:image\/(jpeg|jpg|png|webp);base64,([a-z0-9+/=]+)$/i);
  if (!match) return null;
  const contentType = match[1].toLowerCase() === "jpg" ? "image/jpeg" : `image/${match[1].toLowerCase()}`;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return { bytes, contentType };
};

const validateImage = async (apiKey: string, imageDataUrl: string, userId: string) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      body: JSON.stringify({
        input: [
          {
            content: [
              {
                text:
                  "You are a strict image safety validator for Plantie, a plant-care app. Analyze the entire uploaded image before it is stored. The image must clearly contain a plant, tree, flower, leaf, shrub, herb, crop, garden plant, houseplant, or similar botanical subject. Reject images with people, faces, children, readable personal data, IDs, documents, mail, bills, screens, emails, chats, QR codes, barcodes, license plates, explicit content, unsafe content, private or restricted footage, confidential information, weapons, drugs, gore, self-harm, hate symbols, or anything inappropriate for a plant-care app. Be conservative. If uncertain, reject. Return only valid JSON using the required schema. Do not include markdown, prose, explanations, or extra fields.",
                type: "input_text",
              },
              { detail: "high", image_url: imageDataUrl, type: "input_image" },
            ],
            role: "user",
          },
        ],
        max_output_tokens: 700,
        model: Deno.env.get("OPENAI_MODEL") || "gpt-4o",
        text: { format: { name: "plant_image_upload_validation", schema: validationSchema, strict: true, type: "json_schema" } },
      }),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      method: "POST",
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error("Validated image upload AI request failed", { status: response.status, userIdPrefix: `${userId.slice(0, 8)}...` });
      return null;
    }

    const parsed = JSON.parse(extractOutputText(await response.json())) as unknown;
    return isValidationPayload(parsed) && isAllowed(parsed) ? parsed : null;
  } catch (error) {
    console.error("Validated image upload failed closed", {
      name: error instanceof Error ? error.name : "unknown",
      userIdPrefix: `${userId.slice(0, 8)}...`,
    });
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders, status: 204 });
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return json(503, { error: rejectionMessage });

  const auth = await requireUser(request.headers.get("authorization") ?? "");
  if (!auth) return json(401, { error: "Authentication is required." });

  let body: { householdId?: string; imageDataUrl?: string; imageId?: string; kind?: ImageKind };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: rejectionMessage });
  }

  const householdId = typeof body.householdId === "string" ? body.householdId : "";
  const imageId = typeof body.imageId === "string" ? body.imageId : "";
  const kind = body.kind;
  const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";
  const parsedImage = parseDataUrl(imageDataUrl);

  if (!uuidLike.test(householdId) || !uuidLike.test(imageId) || (kind !== "plant" && kind !== "diagnostic") || !parsedImage || imageDataUrl.length > 1_600_000) {
    return json(400, { error: rejectionMessage });
  }

  const { data: canEdit, error: accessError } = await auth.client.rpc("can_edit_household", { target_household_id: householdId });
  if (accessError || !canEdit) {
    return json(403, { error: "Editor or owner access is required to upload images." });
  }

  const validation = await validateImage(apiKey, imageDataUrl, auth.user.id);
  if (!validation) {
    return json(422, { error: rejectionMessage });
  }

  const bucket = kind === "plant" ? "plant-images" : "diagnostic-images";
  const path = kind === "plant" ? `${householdId}/plants/${imageId}/original.jpg` : `${householdId}/diagnostics/${imageId}/image.jpg`;
  const { error: uploadError } = await createServiceClient().storage.from(bucket).upload(path, parsedImage.bytes, {
    contentType: "image/jpeg",
    upsert: true,
  });

  if (uploadError) {
    console.error("Validated image upload storage write failed", { bucket, userIdPrefix: `${auth.user.id.slice(0, 8)}...` });
    return json(502, { error: "Image upload failed." });
  }

  return json(200, { path });
});
