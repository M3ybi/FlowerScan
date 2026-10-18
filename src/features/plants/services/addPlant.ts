import type { Flower } from "../../../data/flowers.js";
import type { PlantieLanguage } from "../../../lib/onboarding.js";
import type { GeneratedCare, GenerateCareOptions } from "../../../utils/customFlower.js";

export type AddPlantStage = "checking" | "generating" | "saving";
type Input = { name: string; imageDataUrl: string; id: string; householdId: string; language: PlantieLanguage | null };
type Services = {
  assertCanAdd: (householdId: string) => Promise<unknown>;
  generateCare: (name: string, imageDataUrl: string, options: GenerateCareOptions) => Promise<GeneratedCare>;
  save: (plant: Flower) => Promise<boolean>;
  refreshUsage: () => Promise<unknown>;
  isCurrent: () => boolean;
  onStage: (stage: AddPlantStage) => void;
};

// Feature orchestration owns ordering; injected services own API/persistence.
// A stale account/household may finish a read, but cannot start the next write.
export const addPlantFromPhoto = async (input: Input, services: Services): Promise<Flower | null> => {
  if (!services.isCurrent()) return null;
  services.onStage("checking");
  if (input.householdId) await services.assertCanAdd(input.householdId);
  if (!services.isCurrent()) return null;
  services.onStage("generating");
  const care = await services.generateCare(input.name, input.imageDataUrl, {
    generationSource: "initial_plant_add", householdId: input.householdId, language: input.language,
  });
  if (!services.isCurrent()) return null;
  const { displayName, identificationConfidence, ...profile } = care;
  const plant: Flower = { ...profile, displayName: displayName.trim() || input.name, id: input.id,
    identification: identificationConfidence, image: input.imageDataUrl, source: "custom" };
  services.onStage("saving");
  if (!await services.save(plant) || !services.isCurrent()) return null;
  if (input.householdId) await services.refreshUsage().catch(() => undefined);
  return services.isCurrent() ? plant : null;
};
