export const plantImagesBucket = "plant-images";
export const diagnosticImagesBucket = "diagnostic-images";

const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const validateStoragePathId = (label: string, value: string) => {
  const normalized = value.trim();
  if (!uuidLike.test(normalized)) {
    throw new Error(`${label} must be a UUID.`);
  }

  return normalized;
};

export const createPlantImagePath = (householdId: string, plantId: string) =>
  `${validateStoragePathId("householdId", householdId)}/plants/${validateStoragePathId("plantId", plantId)}/original.jpg`;

export const createDiagnosticImagePath = (householdId: string, diagnosticId: string) =>
  `${validateStoragePathId("householdId", householdId)}/diagnostics/${validateStoragePathId("diagnosticId", diagnosticId)}/image.jpg`;
