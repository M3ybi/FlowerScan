export const plantImagesBucket = "plant-images";
export const diagnosticImagesBucket = "diagnostic-images";

// Bound the retry cache and retain only hashes/UUIDs, never photos. The same
// form retry targets the same object even if the previous upload response was lost.
const retryImageIds = new Map<string, string>();
export const getRetryImageId = async (householdId: string, recordId: string, blob: Blob) => {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
  const hash = Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
  const key = `${householdId}:${recordId}:${hash}`;
  const existing = retryImageIds.get(key);
  if (existing) return existing;
  if (retryImageIds.size >= 50) retryImageIds.delete(retryImageIds.keys().next().value!);
  const id = crypto.randomUUID();
  retryImageIds.set(key, id);
  return id;
};

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
