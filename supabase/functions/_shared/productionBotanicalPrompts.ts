import { buildAiLanguageInstruction } from "../../../src/lib/onboarding.ts";
import { careSchema } from "./plantCareContract.ts";
import { diagnosisSchema } from "./plantDiagnosisContract.ts";

// Immutable active v1 provider input. Behavior-changing candidates live separately.
export const productionCarePromptVersion = "plant-care-v1";
export const buildProductionCarePayload = (plantName: string, imageDataUrl: string, language: unknown) => {
  const body = { language };
  return {
        instructions: buildAiLanguageInstruction(body.language),
        input: [{
          content: [
            { text: "Identify the houseplant from its photo and supplied name. Return only JSON matching the schema. Localize all user-facing string values, including the display name, care pill labels and values, care description, identification note, and care tips. Give care suitable for ordinary indoor conditions. Calculate a practical watering interval in days based on the plant and its substrate drying needs. Include exactly five carePills for light, watering, humidity, difficulty, and repotting, and exactly three concise practical care tips. Prefer a specific identification when supported by the photo or name.", type: "input_text" },
            { text: `User-provided name: ${plantName}`, type: "input_text" },
            { detail: "high", image_url: imageDataUrl, type: "input_image" },
          ],
          role: "user",
        }],
        max_output_tokens: 1400,
        text: { format: { name: "plant_care_profile", schema: careSchema, strict: true, type: "json_schema" } },
      };
};

export const productionDiagnosisPromptVersion = "plant-diagnosis-v1";
export const buildProductionDiagnosisPayload = (plantName: string, imageDataUrl: string, language: unknown, symptomNotes: string) => {
  const body = { language };
  return {
        instructions: buildAiLanguageInstruction(body.language),
        input: [{
          content: [
            { text: "Diagnose the houseplant problem from the affected part shown in the photo. Return only JSON matching the schema. Keep the response concise: at most 5 short observed symptoms, 5 short recommended steps and 3 sentences of reasoning. Be cautious: lower confidence and state uncertainty when the photo or symptoms are unclear. Do not state a definitive diagnosis without visual evidence.", type: "input_text" },
            { text: `Plant: ${plantName}`, type: "input_text" },
            ...(symptomNotes ? [{ text: `User notes: ${symptomNotes}`, type: "input_text" }] : []),
            { detail: "high", image_url: imageDataUrl, type: "input_image" },
          ],
          role: "user",
        }],
        max_output_tokens: 2400,
        text: { format: { name: "plant_problem_diagnosis", schema: diagnosisSchema, strict: true, type: "json_schema" } },
      };
};

