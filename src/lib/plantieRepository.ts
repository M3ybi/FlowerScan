import { supabase } from "./supabase.js";
import type { DiagnosisConfirmation, DiagnosisRiskLevel, PlantDiagnosisDraft } from "../utils/diagnostics.js";
import {
  createDiagnosticImagePath,
  createPlantImagePath,
  diagnosticImagesBucket,
  plantImagesBucket,
} from "./imageStoragePaths.js";
import { createPrivateImageSignedUrl } from "./imageCaptureService.js";

export type IdentificationStatus = "confident" | "likely" | "needs_confirmation";
export type CarePillTone = "green" | "amber" | "blue" | "rose";
export type PlantSource = "built_in" | "custom";
export type HouseholdRole = "owner" | "editor" | "viewer";

type DbCarePill = {
  id: string;
  label: string;
  position: number;
  tone: CarePillTone;
  value: string;
};

type DbCareTip = {
  id: string;
  position: number;
  tip: string;
};

type DbPlantCatalog = {
  id: string;
  legacy_id: string;
  display_name: string;
  likely_name: string;
  identification: IdentificationStatus;
  identification_note: string;
  image_path: string | null;
  short_care: string;
  light: string;
  watering: string;
  watering_interval_days: number | null;
  soil: string;
  is_active: boolean;
  plant_care_pills?: DbCarePill[] | null;
  plant_care_tips?: DbCareTip[] | null;
};

type DbHousehold = {
  id: string;
  name: string;
  legacy_public_token: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type DbHouseholdInvite = {
  id: string;
  household_id: string;
  invitee_email: string;
  role: HouseholdRole;
  expires_at: string | null;
  used_at?: string | null;
  revoked_at?: string | null;
  token?: string;
  created_at: string;
  created_by?: string | null;
};

type DbHouseholdMember = {
  created_at: string;
  email: string;
  household_id: string;
  role: HouseholdRole;
  user_id: string;
};

type DbPlant = {
  id: string;
  household_id: string;
  catalog_plant_id: string | null;
  legacy_id: string | null;
  source: PlantSource;
  display_name: string;
  likely_name: string;
  identification: IdentificationStatus;
  identification_note: string;
  image_path: string | null;
  short_care: string;
  light: string;
  watering: string;
  watering_interval_days: number | null;
  notifications_enabled: boolean;
  soil: string;
  is_removed: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  plant_care_pills?: DbCarePill[] | null;
  plant_care_tips?: DbCareTip[] | null;
};

type DbPlantCareRecord = {
  plant_id?: string;
  last_fertilized?: string | null;
  last_transplanted?: string | null;
  last_watered?: string | null;
  note?: string;
};

type DbHouseholdReportSettings = {
  household_id: string;
  last_push_notification_date: string | null;
  last_sent_date: string | null;
  recipient_email: string | null;
};

type DbPlantDiagnostic = {
  id: string;
  household_id: string;
  plant_id: string;
  legacy_id: string | null;
  image_path: string | null;
  diagnosis_title: string;
  confidence: number;
  confidence_label: DbDiagnosisConfidenceLabel;
  reasoning_summary: string;
  risk_level: DiagnosisRiskLevel;
  disclaimer: string;
  user_confirmation: DiagnosisConfirmation;
  user_note: string;
  created_at: string;
  updated_at: string;
  diagnostic_observed_symptoms?: { position: number; symptom: string }[] | null;
  diagnostic_recommended_steps?: { position: number; step: string }[] | null;
};

type DbDiagnosisConfidenceLabel = "nizka" | "stredna" | "vysoka";

export type CarePill = {
  id: string;
  label: string;
  position: number;
  tone: CarePillTone;
  value: string;
};

export type CareTip = {
  id: string;
  position: number;
  tip: string;
};

export type PlantCatalogItem = {
  id: string;
  legacyId: string;
  displayName: string;
  likelyName: string;
  identification: IdentificationStatus;
  identificationNote: string;
  imagePath: string | null;
  shortCare: string;
  light: string;
  watering: string;
  wateringIntervalDays: number | null;
  soil: string;
  isActive: boolean;
  carePills: CarePill[];
  careTips: CareTip[];
};

export type Household = {
  id: string;
  name: string;
  legacyPublicToken: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HouseholdInvite = {
  id: string;
  householdId: string;
  inviteeEmail: string;
  role: HouseholdRole;
  expiresAt: string | null;
  usedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdBy: string | null;
};

export type CreatedHouseholdInvite = HouseholdInvite & {
  token: string;
};

export type HouseholdMember = {
  createdAt: string;
  email: string;
  householdId: string;
  role: HouseholdRole;
  userId: string;
};

export type HouseholdPlant = {
  id: string;
  householdId: string;
  catalogPlantId: string | null;
  legacyId: string | null;
  source: PlantSource;
  displayName: string;
  likelyName: string;
  identification: IdentificationStatus;
  identificationNote: string;
  imagePath: string | null;
  shortCare: string;
  light: string;
  watering: string;
  wateringIntervalDays: number | null;
  notificationsEnabled: boolean;
  soil: string;
  isRemoved: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  carePills: CarePill[];
  careTips: CareTip[];
};

export type CreateHouseholdPlantInput = {
  householdId: string;
  catalogPlantId?: string | null;
  legacyId?: string | null;
  source: PlantSource;
  displayName: string;
  likelyName: string;
  identification: IdentificationStatus;
  identificationNote: string;
  imagePath?: string | null;
  shortCare: string;
  light: string;
  watering: string;
  wateringIntervalDays?: number | null;
  notificationsEnabled?: boolean;
  soil: string;
  carePills?: {
    label: string;
    tone: CarePillTone;
    value: string;
  }[];
  careTips?: string[];
};

export type UpdateHouseholdPlantPatch = Partial<
  Pick<
    CreateHouseholdPlantInput,
    | "catalogPlantId"
    | "displayName"
    | "identification"
    | "identificationNote"
    | "imagePath"
    | "legacyId"
    | "light"
    | "likelyName"
    | "notificationsEnabled"
    | "shortCare"
    | "soil"
    | "source"
    | "watering"
    | "wateringIntervalDays"
  >
> & {
  carePills?: CreateHouseholdPlantInput["carePills"];
  careTips?: CreateHouseholdPlantInput["careTips"];
  isRemoved?: boolean;
};

export type UpdatePlantCareRecordPatch = {
  lastFertilized?: string | null;
  lastTransplanted?: string | null;
  lastWatered?: string | null;
  note?: string;
};

export type UpdateHouseholdReportSettingsPatch = {
  lastPushNotificationDate?: string | null;
  lastSentDate?: string | null;
  recipientEmail?: string | null;
};

export type PlantCareRecord = {
  lastFertilized: string;
  lastTransplanted: string;
  lastWatered: string;
  note: string;
  plantId: string;
};

export type HouseholdReportSettings = {
  householdId: string;
  lastPushNotificationDate: string;
  lastSentDate: string;
  recipientEmail: string;
};

export type SupabasePlantDiagnostic = PlantDiagnosisDraft & {
  id: string;
  householdId: string;
  imagePath: string | null;
  legacyId: string | null;
  plantId: string;
  userConfirmation: DiagnosisConfirmation;
  userNote: string;
  createdAt: string;
  updatedAt: string;
};

export type CreatePlantDiagnosticInput = PlantDiagnosisDraft & {
  imagePath?: string | null;
  legacyId?: string | null;
  plantId: string;
  userConfirmation: DiagnosisConfirmation;
  userNote?: string;
};

export type UpdatePlantDiagnosticPatch = {
  imagePath?: string | null;
  userConfirmation?: DiagnosisConfirmation;
  userNote?: string;
};

export const imageUploadValidationToken = "ai-plant-image-validation-passed" as const;

export type ImageUploadValidation = {
  validationToken: typeof imageUploadValidationToken;
};

const assertImageUploadValidation = (validation?: ImageUploadValidation) => {
  if (validation?.validationToken !== imageUploadValidationToken) {
    throw new Error("Image upload requires AI validation.");
  }
};

const blobToDataUrl = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return `data:${blob.type || "image/jpeg"};base64,${btoa(binary)}`;
};

const uploadValidatedImage = async ({
  householdId,
  imageBlob,
  imageId,
  kind,
}: {
  householdId: string;
  imageBlob: Blob;
  imageId: string;
  kind: "diagnostic" | "plant";
}) => {
  const { data, error } = await getClient().functions.invoke("upload-validated-image", {
    body: {
      householdId,
      imageDataUrl: await blobToDataUrl(imageBlob),
      imageId,
      kind,
    },
  });

  if (error) {
    throw error;
  }

  if (!data || typeof (data as { path?: unknown }).path !== "string") {
    throw new Error("Validated image upload did not return a storage path.");
  }

  return (data as { path: string }).path;
};

const plantCatalogSelect = `
  *,
  plant_care_pills(*),
  plant_care_tips(*)
`;

const householdPlantSelect = `
  *,
  plant_care_pills(*),
  plant_care_tips(*)
`;

const plantDiagnosticSelect = `
  *,
  diagnostic_observed_symptoms(*),
  diagnostic_recommended_steps(*)
`;

const getClient = () => {
  if (!supabase) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }

  return supabase;
};

export const normalizeInviteEmail = (email: string) => email.trim().toLowerCase();

export const isValidInviteEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeInviteEmail(email));

const byPosition = <T extends { position: number }>(items: T[] | null | undefined) =>
  [...(items ?? [])].sort((left, right) => left.position - right.position);

const mapCarePill = (pill: DbCarePill): CarePill => ({
  id: pill.id,
  label: pill.label,
  position: pill.position,
  tone: pill.tone,
  value: pill.value,
});

const mapCareTip = (tip: DbCareTip): CareTip => ({
  id: tip.id,
  position: tip.position,
  tip: tip.tip,
});

const mapCatalogItem = (plant: DbPlantCatalog): PlantCatalogItem => ({
  carePills: byPosition(plant.plant_care_pills).map(mapCarePill),
  careTips: byPosition(plant.plant_care_tips).map(mapCareTip),
  displayName: plant.display_name,
  id: plant.id,
  identification: plant.identification,
  identificationNote: plant.identification_note,
  imagePath: plant.image_path,
  isActive: plant.is_active,
  legacyId: plant.legacy_id,
  likelyName: plant.likely_name,
  light: plant.light,
  shortCare: plant.short_care,
  soil: plant.soil,
  watering: plant.watering,
  wateringIntervalDays: plant.watering_interval_days,
});

const mapHousehold = (household: DbHousehold): Household => ({
  createdAt: household.created_at,
  createdBy: household.created_by,
  id: household.id,
  legacyPublicToken: household.legacy_public_token,
  name: household.name,
  updatedAt: household.updated_at,
});

const mapHouseholdInvite = (invite: DbHouseholdInvite): HouseholdInvite => ({
  createdAt: invite.created_at,
  createdBy: invite.created_by ?? null,
  expiresAt: invite.expires_at,
  householdId: invite.household_id,
  id: invite.id,
  inviteeEmail: invite.invitee_email,
  revokedAt: invite.revoked_at ?? null,
  role: invite.role,
  usedAt: invite.used_at ?? null,
});

const mapCreatedHouseholdInvite = (invite: DbHouseholdInvite): CreatedHouseholdInvite => ({
  ...mapHouseholdInvite(invite),
  token: invite.token ?? "",
});

const mapHouseholdMember = (member: DbHouseholdMember): HouseholdMember => ({
  createdAt: member.created_at,
  email: member.email,
  householdId: member.household_id,
  role: member.role,
  userId: member.user_id,
});

const mapHouseholdPlant = (plant: DbPlant): HouseholdPlant => ({
  carePills: byPosition(plant.plant_care_pills).map(mapCarePill),
  careTips: byPosition(plant.plant_care_tips).map(mapCareTip),
  catalogPlantId: plant.catalog_plant_id,
  createdAt: plant.created_at,
  createdBy: plant.created_by,
  displayName: plant.display_name,
  householdId: plant.household_id,
  id: plant.id,
  identification: plant.identification,
  identificationNote: plant.identification_note,
  imagePath: plant.image_path,
  isRemoved: plant.is_removed,
  legacyId: plant.legacy_id,
  likelyName: plant.likely_name,
  light: plant.light,
  notificationsEnabled: plant.notifications_enabled,
  shortCare: plant.short_care,
  soil: plant.soil,
  source: plant.source,
  updatedAt: plant.updated_at,
  watering: plant.watering,
  wateringIntervalDays: plant.watering_interval_days,
});

const toDisplayConfidenceLabel = (label: DbDiagnosisConfidenceLabel): PlantDiagnosisDraft["confidenceLabel"] => {
  if (label === "nizka") return "nízka";
  if (label === "vysoka") return "vysoká";
  return "stredná";
};

const toDbConfidenceLabel = (label: PlantDiagnosisDraft["confidenceLabel"]): DbDiagnosisConfidenceLabel => {
  if (label === "nízka") return "nizka";
  if (label === "vysoká") return "vysoka";
  return "stredna";
};

const mapPlantDiagnostic = (diagnostic: DbPlantDiagnostic): SupabasePlantDiagnostic => ({
  confidence: diagnostic.confidence,
  confidenceLabel: toDisplayConfidenceLabel(diagnostic.confidence_label),
  createdAt: diagnostic.created_at,
  diagnosisTitle: diagnostic.diagnosis_title,
  disclaimer: diagnostic.disclaimer,
  householdId: diagnostic.household_id,
  id: diagnostic.id,
  imagePath: diagnostic.image_path,
  legacyId: diagnostic.legacy_id,
  observedSymptoms: byPosition(diagnostic.diagnostic_observed_symptoms).map((item) => item.symptom),
  plantId: diagnostic.plant_id,
  reasoningSummary: diagnostic.reasoning_summary,
  recommendedSteps: byPosition(diagnostic.diagnostic_recommended_steps).map((item) => item.step),
  riskLevel: diagnostic.risk_level,
  updatedAt: diagnostic.updated_at,
  userConfirmation: diagnostic.user_confirmation,
  userNote: diagnostic.user_note,
});

const mapPlantCareRecord = (record: DbPlantCareRecord): PlantCareRecord => ({
  lastFertilized: record.last_fertilized ?? "",
  lastTransplanted: record.last_transplanted ?? "",
  lastWatered: record.last_watered ?? "",
  note: record.note ?? "",
  plantId: record.plant_id ?? "",
});

const mapHouseholdReportSettings = (settings: DbHouseholdReportSettings): HouseholdReportSettings => ({
  householdId: settings.household_id,
  lastPushNotificationDate: settings.last_push_notification_date ?? "",
  lastSentDate: settings.last_sent_date ?? "",
  recipientEmail: settings.recipient_email ?? "",
});

const plantInputToInsert = (input: CreateHouseholdPlantInput) => ({
  catalog_plant_id: input.catalogPlantId ?? null,
  display_name: input.displayName,
  household_id: input.householdId,
  identification: input.identification,
  identification_note: input.identificationNote,
  image_path: input.imagePath ?? null,
  legacy_id: input.legacyId ?? null,
  likely_name: input.likelyName,
  light: input.light,
  notifications_enabled: input.notificationsEnabled ?? true,
  short_care: input.shortCare,
  soil: input.soil,
  source: input.source,
  watering: input.watering,
  watering_interval_days: input.wateringIntervalDays ?? null,
});

const plantPatchToUpdate = (patch: UpdateHouseholdPlantPatch) => ({
  ...(patch.catalogPlantId !== undefined ? { catalog_plant_id: patch.catalogPlantId } : {}),
  ...(patch.displayName !== undefined ? { display_name: patch.displayName } : {}),
  ...(patch.identification !== undefined ? { identification: patch.identification } : {}),
  ...(patch.identificationNote !== undefined ? { identification_note: patch.identificationNote } : {}),
  ...(patch.imagePath !== undefined ? { image_path: patch.imagePath } : {}),
  ...(patch.isRemoved !== undefined ? { is_removed: patch.isRemoved } : {}),
  ...(patch.legacyId !== undefined ? { legacy_id: patch.legacyId } : {}),
  ...(patch.light !== undefined ? { light: patch.light } : {}),
  ...(patch.likelyName !== undefined ? { likely_name: patch.likelyName } : {}),
  ...(patch.notificationsEnabled !== undefined ? { notifications_enabled: patch.notificationsEnabled } : {}),
  ...(patch.shortCare !== undefined ? { short_care: patch.shortCare } : {}),
  ...(patch.soil !== undefined ? { soil: patch.soil } : {}),
  ...(patch.source !== undefined ? { source: patch.source } : {}),
  ...(patch.watering !== undefined ? { watering: patch.watering } : {}),
  ...(patch.wateringIntervalDays !== undefined ? { watering_interval_days: patch.wateringIntervalDays } : {}),
});

const recordPatchToUpsert = (patch: UpdatePlantCareRecordPatch): DbPlantCareRecord => ({
  ...(patch.lastFertilized !== undefined ? { last_fertilized: patch.lastFertilized } : {}),
  ...(patch.lastTransplanted !== undefined ? { last_transplanted: patch.lastTransplanted } : {}),
  ...(patch.lastWatered !== undefined ? { last_watered: patch.lastWatered } : {}),
  ...(patch.note !== undefined ? { note: patch.note } : {}),
});

export const getPlantCatalog = async () => {
  const { data, error } = await getClient()
    .from("plant_catalog")
    .select(plantCatalogSelect)
    .eq("is_active", true)
    .order("legacy_id", { ascending: true })
    .returns<DbPlantCatalog[]>();

  if (error) {
    throw error;
  }

  return data.map(mapCatalogItem);
};

export const getPlantCatalogByLegacyId = async (legacyId: string) => {
  const { data, error } = await getClient()
    .from("plant_catalog")
    .select(plantCatalogSelect)
    .eq("legacy_id", legacyId)
    .maybeSingle<DbPlantCatalog>();

  if (error) {
    throw error;
  }

  return data ? mapCatalogItem(data) : null;
};

export const getUserHouseholds = async () => {
  const { data, error } = await getClient()
    .from("households")
    .select("*")
    .order("created_at", { ascending: true })
    .returns<DbHousehold[]>();

  if (error) {
    throw error;
  }

  return data.map(mapHousehold);
};

export const getHouseholdPlants = async (householdId: string) => {
  const { data, error } = await getClient()
    .from("plants")
    .select(householdPlantSelect)
    .eq("household_id", householdId)
    .eq("is_removed", false)
    .order("created_at", { ascending: true })
    .returns<DbPlant[]>();

  if (error) {
    throw error;
  }

  return data.map(mapHouseholdPlant);
};

export const getHouseholdPlantsIncludingRemoved = async (householdId: string) => {
  const { data, error } = await getClient()
    .from("plants")
    .select(householdPlantSelect)
    .eq("household_id", householdId)
    .order("created_at", { ascending: true })
    .returns<DbPlant[]>();

  if (error) {
    throw error;
  }

  return data.map(mapHouseholdPlant);
};

export const getHouseholdPlantByLegacyId = async (householdId: string, legacyId: string) => {
  const { data, error } = await getClient()
    .from("plants")
    .select(householdPlantSelect)
    .eq("household_id", householdId)
    .eq("legacy_id", legacyId)
    .maybeSingle<DbPlant>();

  if (error) {
    throw error;
  }

  return data ? mapHouseholdPlant(data) : null;
};

export const getHouseholdPlantById = async (plantId: string) => {
  const { data, error } = await getClient()
    .from("plants")
    .select(householdPlantSelect)
    .eq("id", plantId)
    .single<DbPlant>();

  if (error) {
    throw error;
  }

  return mapHouseholdPlant(data);
};

export const createHousehold = async (name: string) => {
  const { data, error } = await getClient()
    .rpc("create_household_for_current_user", { household_name: name });

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Supabase did not return the created household.");
  }

  return mapHousehold(data as DbHousehold);
};

export const createHouseholdInvite = async (
  householdId: string,
  email: string,
  role: HouseholdRole = "editor",
  expiresAt: string | null = null,
) => {
  const normalizedEmail = normalizeInviteEmail(email);
  if (!isValidInviteEmail(normalizedEmail)) {
    throw new Error("Enter a valid family member email address.");
  }

  const { data, error } = await getClient()
    .rpc("create_household_invite", {
      invite_email: normalizedEmail,
      invite_expires_at: expiresAt,
      invite_role: role,
      target_household_id: householdId,
    })
    .single<DbHouseholdInvite>();

  if (error) {
    throw error;
  }

  if (!data?.token) {
    throw new Error("Supabase did not return an invite token.");
  }

  return mapCreatedHouseholdInvite(data);
};

export const listHouseholdInvites = async (householdId: string) => {
  const { data, error } = await getClient()
    .rpc("list_household_invites", { target_household_id: householdId })
    .returns<DbHouseholdInvite[]>();

  if (error) {
    throw error;
  }

  return ((data ?? []) as DbHouseholdInvite[]).map(mapHouseholdInvite);
};

export const listHouseholdMembers = async (householdId: string) => {
  const { data, error } = await getClient()
    .rpc("list_household_members", { target_household_id: householdId })
    .returns<DbHouseholdMember[]>();

  if (error) {
    throw error;
  }

  return ((data ?? []) as DbHouseholdMember[]).map(mapHouseholdMember);
};

export const revokeHouseholdInvite = async (inviteId: string) => {
  const { error } = await getClient().rpc("revoke_household_invite", { invite_id: inviteId });

  if (error) {
    throw error;
  }
};

export const joinHouseholdByInvite = async (token: string) => {
  const { data, error } = await getClient()
    .rpc("join_household_by_invite", { raw_token: token })
    .single<DbHousehold>();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Supabase did not return the joined household.");
  }

  return mapHousehold(data);
};

export const sendHouseholdInviteEmail = async ({
  householdId,
  householdName,
  inviteUrl,
  recipientEmail,
  role,
}: {
  householdId: string;
  householdName: string;
  inviteUrl: string;
  recipientEmail: string;
  role: HouseholdRole;
}) => {
  const { error } = await getClient().functions.invoke("send-household-invite-email", {
    body: {
      householdId,
      householdName,
      inviteUrl,
      recipientEmail: normalizeInviteEmail(recipientEmail),
      role,
    },
  });

  if (error) {
    throw error;
  }
};

export const createHouseholdPlant = async (input: CreateHouseholdPlantInput) => {
  const client = getClient();
  const { data: plant, error: plantError } = await client
    .from("plants")
    .insert(plantInputToInsert(input))
    .select(householdPlantSelect)
    .single<DbPlant>();

  if (plantError) {
    throw plantError;
  }

  const carePills = input.carePills ?? [];
  const careTips = input.careTips ?? [];

  try {
    if (carePills.length > 0) {
      const { error } = await client.from("plant_care_pills").insert(
        carePills.map((pill, index) => ({
          label: pill.label,
          plant_id: plant.id,
          position: index,
          tone: pill.tone,
          value: pill.value,
        })),
      );

      if (error) {
        throw error;
      }
    }

    if (careTips.length > 0) {
      const { error } = await client.from("plant_care_tips").insert(
        careTips.map((tip, index) => ({
          plant_id: plant.id,
          position: index,
          tip,
        })),
      );

      if (error) {
        throw error;
      }
    }
  } catch (error) {
    await client.from("plants").delete().eq("id", plant.id);
    throw error;
  }

  const { data: createdPlant, error: reloadError } = await client
    .from("plants")
    .select(householdPlantSelect)
    .eq("id", plant.id)
    .single<DbPlant>();

  if (reloadError) {
    throw reloadError;
  }

  return mapHouseholdPlant(createdPlant);
};

export const updateHouseholdPlant = async (id: string, patch: UpdateHouseholdPlantPatch) => {
  const client = getClient();
  const { data, error } = await client
    .from("plants")
    .update(plantPatchToUpdate(patch))
    .eq("id", id)
    .select(householdPlantSelect)
    .single<DbPlant>();

  if (error) {
    throw error;
  }

  if (patch.carePills !== undefined || patch.careTips !== undefined) {
    const [{ error: pillDeleteError }, { error: tipDeleteError }] = await Promise.all([
      patch.carePills !== undefined
        ? client.from("plant_care_pills").delete().eq("plant_id", id)
        : Promise.resolve({ error: null }),
      patch.careTips !== undefined
        ? client.from("plant_care_tips").delete().eq("plant_id", id)
        : Promise.resolve({ error: null }),
    ]);

    if (pillDeleteError || tipDeleteError) {
      throw pillDeleteError ?? tipDeleteError;
    }

    if (patch.carePills && patch.carePills.length > 0) {
      const { error: pillInsertError } = await client.from("plant_care_pills").insert(
        patch.carePills.map((pill, index) => ({
          label: pill.label,
          plant_id: id,
          position: index,
          tone: pill.tone,
          value: pill.value,
        })),
      );

      if (pillInsertError) {
        throw pillInsertError;
      }
    }

    if (patch.careTips && patch.careTips.length > 0) {
      const { error: tipInsertError } = await client.from("plant_care_tips").insert(
        patch.careTips.map((tip, index) => ({
          plant_id: id,
          position: index,
          tip,
        })),
      );

      if (tipInsertError) {
        throw tipInsertError;
      }
    }

    const { data: reloaded, error: reloadError } = await client
      .from("plants")
      .select(householdPlantSelect)
      .eq("id", id)
      .single<DbPlant>();

    if (reloadError) {
      throw reloadError;
    }

    return mapHouseholdPlant(reloaded);
  }

  return mapHouseholdPlant(data);
};

export const updateHouseholdLegacyToken = async (householdId: string, legacyPublicToken: string | null) => {
  const { data, error } = await getClient()
    .from("households")
    .update({ legacy_public_token: legacyPublicToken })
    .eq("id", householdId)
    .select("*")
    .single<DbHousehold>();

  if (error) {
    throw error;
  }

  return mapHousehold(data);
};

export const updatePlantCareRecord = async (plantId: string, patch: UpdatePlantCareRecordPatch) => {
  const client = getClient();
  const { data: plant, error: plantError } = await client
    .from("plants")
    .select("id, household_id")
    .eq("id", plantId)
    .single<Pick<DbPlant, "household_id" | "id">>();

  if (plantError) {
    throw plantError;
  }

  const { data, error } = await client
    .from("plant_care_records")
    .upsert({
      household_id: plant.household_id,
      plant_id: plant.id,
      ...recordPatchToUpsert(patch),
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const getHouseholdCareRecords = async (householdId: string) => {
  const { data, error } = await getClient()
    .from("plant_care_records")
    .select("*")
    .eq("household_id", householdId)
    .returns<DbPlantCareRecord[]>();

  if (error) {
    throw error;
  }

  return data.map(mapPlantCareRecord).filter((record) => record.plantId);
};

export const uploadDiagnosticImage = async (
  householdId: string,
  diagnosticId: string,
  imageBlob: Blob,
  validation?: ImageUploadValidation,
) => {
  assertImageUploadValidation(validation);
  createDiagnosticImagePath(householdId, diagnosticId);
  return uploadValidatedImage({ householdId, imageBlob, imageId: diagnosticId, kind: "diagnostic" });
};

export const uploadPlantImage = async (householdId: string, plantId: string, imageBlob: Blob, validation?: ImageUploadValidation) => {
  assertImageUploadValidation(validation);
  createPlantImagePath(householdId, plantId);
  return uploadValidatedImage({ householdId, imageBlob, imageId: plantId, kind: "plant" });
};

export const updateHouseholdReportSettings = async (householdId: string, patch: UpdateHouseholdReportSettingsPatch) => {
  const { data, error } = await getClient()
    .from("household_report_settings")
    .upsert({
      household_id: householdId,
      ...(patch.lastPushNotificationDate !== undefined ? { last_push_notification_date: patch.lastPushNotificationDate } : {}),
      ...(patch.lastSentDate !== undefined ? { last_sent_date: patch.lastSentDate } : {}),
      ...(patch.recipientEmail !== undefined ? { recipient_email: patch.recipientEmail } : {}),
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const getHouseholdReportSettings = async (householdId: string) => {
  const { data, error } = await getClient()
    .from("household_report_settings")
    .select("*")
    .eq("household_id", householdId)
    .maybeSingle<DbHouseholdReportSettings>();

  if (error) {
    throw error;
  }

  return data ? mapHouseholdReportSettings(data) : null;
};

export const getHouseholdDiagnostics = async (householdId: string) => {
  const { data, error } = await getClient()
    .from("plant_diagnostics")
    .select(plantDiagnosticSelect)
    .eq("household_id", householdId)
    .order("created_at", { ascending: false })
    .returns<DbPlantDiagnostic[]>();

  if (error) {
    throw error;
  }

  return data.map(mapPlantDiagnostic);
};

export const getPlantImagePublicUrl = (imagePath: string) =>
  getClient().storage.from("plant-images").getPublicUrl(imagePath).data.publicUrl;

export const getPlantImageSignedUrl = (imagePath: string, expiresInSeconds = 300) =>
  createPrivateImageSignedUrl(getClient(), plantImagesBucket, imagePath, expiresInSeconds);

export const getDiagnosticImageSignedUrl = (imagePath: string, expiresInSeconds = 300) =>
  createPrivateImageSignedUrl(getClient(), diagnosticImagesBucket, imagePath, expiresInSeconds);

export const getPlantDiagnostics = async (plantId: string) => {
  const { data, error } = await getClient()
    .from("plant_diagnostics")
    .select(plantDiagnosticSelect)
    .eq("plant_id", plantId)
    .order("created_at", { ascending: false })
    .returns<DbPlantDiagnostic[]>();

  if (error) {
    throw error;
  }

  return data.map(mapPlantDiagnostic);
};

export const createPlantDiagnostic = async (input: CreatePlantDiagnosticInput) => {
  const client = getClient();
  const { data: plant, error: plantError } = await client
    .from("plants")
    .select("id, household_id")
    .eq("id", input.plantId)
    .single<Pick<DbPlant, "household_id" | "id">>();

  if (plantError) {
    throw plantError;
  }

  const { data: diagnostic, error: diagnosticError } = await client
    .from("plant_diagnostics")
    .insert({
      confidence: input.confidence,
      confidence_label: toDbConfidenceLabel(input.confidenceLabel),
      diagnosis_title: input.diagnosisTitle,
      disclaimer: input.disclaimer,
      household_id: plant.household_id,
      image_path: input.imagePath ?? null,
      legacy_id: input.legacyId ?? null,
      plant_id: plant.id,
      reasoning_summary: input.reasoningSummary,
      risk_level: input.riskLevel,
      user_confirmation: input.userConfirmation,
      user_note: input.userNote ?? "",
    })
    .select(plantDiagnosticSelect)
    .single<DbPlantDiagnostic>();

  if (diagnosticError) {
    throw diagnosticError;
  }

  try {
    if (input.observedSymptoms.length > 0) {
      const { error } = await client.from("diagnostic_observed_symptoms").insert(
        input.observedSymptoms.map((symptom, position) => ({
          diagnostic_id: diagnostic.id,
          position,
          symptom,
        })),
      );
      if (error) {
        throw error;
      }
    }

    if (input.recommendedSteps.length > 0) {
      const { error } = await client.from("diagnostic_recommended_steps").insert(
        input.recommendedSteps.map((step, position) => ({
          diagnostic_id: diagnostic.id,
          position,
          step,
        })),
      );
      if (error) {
        throw error;
      }
    }
  } catch (error) {
    await client.from("plant_diagnostics").delete().eq("id", diagnostic.id);
    throw error;
  }

  const { data: reloaded, error: reloadError } = await client
    .from("plant_diagnostics")
    .select(plantDiagnosticSelect)
    .eq("id", diagnostic.id)
    .single<DbPlantDiagnostic>();

  if (reloadError) {
    throw reloadError;
  }

  return mapPlantDiagnostic(reloaded);
};

export const updatePlantDiagnostic = async (id: string, patch: UpdatePlantDiagnosticPatch) => {
  const { data, error } = await getClient()
    .from("plant_diagnostics")
    .update({
      ...(patch.imagePath !== undefined ? { image_path: patch.imagePath } : {}),
      ...(patch.userConfirmation !== undefined ? { user_confirmation: patch.userConfirmation } : {}),
      ...(patch.userNote !== undefined ? { user_note: patch.userNote } : {}),
    })
    .eq("id", id)
    .select(plantDiagnosticSelect)
    .single<DbPlantDiagnostic>();

  if (error) {
    throw error;
  }

  return mapPlantDiagnostic(data);
};
