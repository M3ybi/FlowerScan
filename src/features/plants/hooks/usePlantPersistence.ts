import type { Flower } from "../../../data/flowers";
import type { FlowerRecord, FlowerRecords } from "../../../hooks/useFlowerRecords";
import { createTranslator } from "../../../lib/i18n";
import type { SupabaseReadThroughState } from "../../../lib/supabaseReadThrough";
import type { SupabaseWriteMode } from "../../../lib/supabaseSourceOfTruth";
import {
  setSupabasePlantRemoved,
  updateSupabaseCareRecord,
  upsertSupabasePlantFromFlower
} from "../../../lib/supabaseSourceOfTruth";

type Dependencies = {
  isHouseholdOperationCurrent: (started?: { userId: string | null; householdToken: string | null; generation: number; }) => boolean;
  supabasePlantIdsByLegacyId: Record<string, string>;
  supabaseWriteMode: SupabaseWriteMode;
  writeSupabaseFirst: <T>(operation: () => Promise<T>, mirrorLegacy: () => void) => Promise<boolean>;
  updateRecord: (flowerId: string, patch: Partial<FlowerRecord>) => void;
  setQuickRecordStatus: React.Dispatch<React.SetStateAction<string>>;
  t: ReturnType<typeof createTranslator>;
  isSupabaseOnlyDataMode: boolean;
  setSupabaseReadError: React.Dispatch<React.SetStateAction<boolean>>;
  isUsingSupabaseReadState: boolean;
  setSupabaseReadState: React.Dispatch<React.SetStateAction<SupabaseReadThroughState | null>>;
  pendingQuickRecordKey: string;
  setPendingQuickRecordKey: React.Dispatch<React.SetStateAction<string>>;
  supabaseReadState: SupabaseReadThroughState | null;
  updateFlower: (flower: Flower) => void;
  refreshSupabaseReadState: () => Promise<SupabaseReadThroughState | null>;
  addCustomFlower: (flower: Flower) => void;
  removeFlower: (flowerId: string) => void;
};

export const usePlantPersistence = ({
  isHouseholdOperationCurrent,
  supabasePlantIdsByLegacyId,
  supabaseWriteMode,
  writeSupabaseFirst,
  updateRecord,
  setQuickRecordStatus,
  t,
  isSupabaseOnlyDataMode,
  setSupabaseReadError,
  isUsingSupabaseReadState,
  setSupabaseReadState,
  pendingQuickRecordKey,
  setPendingQuickRecordKey,
  supabaseReadState,
  updateFlower,
  refreshSupabaseReadState,
  addCustomFlower,
  removeFlower
}: Dependencies) => {
  const updateCareRecord = async (flowerId: string, patch: Partial<FlowerRecords[string]>, message = "") => {
    if (!isHouseholdOperationCurrent()) return false;
    const supabasePlantId = supabasePlantIdsByLegacyId[flowerId];
    let saved = false;

    if (supabaseWriteMode === "supabase-first" && supabasePlantId) {
      saved = await writeSupabaseFirst(
        () => updateSupabaseCareRecord(supabasePlantId, patch),
        () => updateRecord(flowerId, patch),
      );
      if (!isHouseholdOperationCurrent()) return false;
      if (!saved) {
        setQuickRecordStatus(t("sync.careWriteFallback"));
      }
    } else if (isSupabaseOnlyDataMode) {
      setSupabaseReadError(true);
      setQuickRecordStatus(t("sync.plantUnavailable"));
    } else {
      updateRecord(flowerId, patch);
      saved = true;
    }

    if (saved && message) {
      setQuickRecordStatus(message);
    }

    if (saved && isUsingSupabaseReadState) {
      const emptyCareRecord = { lastFertilized: "", lastTransplanted: "", lastWatered: "", note: "" };
      setSupabaseReadState((current) =>
        current
          ? {
            ...current,
            records: {
              ...current.records,
              [flowerId]: {
                ...emptyCareRecord,
                ...(current.records[flowerId] ?? {}),
                ...patch,
              },
            },
          }
          : current,
      );
    }

    return saved;
  };

  const saveQuickRecord = async (actionKey: string, flowerId: string, patch: Partial<FlowerRecords[string]>, message: string) => {
    if (!isHouseholdOperationCurrent()) return;
    if (pendingQuickRecordKey) {
      return;
    }

    setPendingQuickRecordKey(actionKey);
    try {
      await updateCareRecord(flowerId, patch, message);
    } catch {
      if (!isHouseholdOperationCurrent()) return;
      setSupabaseReadError(true);
      setQuickRecordStatus(t("sync.careWriteFallback"));
    } finally {
      if (isHouseholdOperationCurrent()) setPendingQuickRecordKey("");
    }
  };

  const saveFlower = async (flower: Flower, message = "") => {
    if (!isHouseholdOperationCurrent()) return false;
    if (supabaseWriteMode === "supabase-first" && supabaseReadState) {
      const result = await writeSupabaseFirst(
        () => upsertSupabasePlantFromFlower(supabaseReadState.household.id, flower),
        () => updateFlower(flower),
      );
      if (isHouseholdOperationCurrent() && result && message) {
        setQuickRecordStatus(message);
      }
      return (Boolean(result) || !isSupabaseOnlyDataMode) && isHouseholdOperationCurrent();
    }

    if (isSupabaseOnlyDataMode) {
      setSupabaseReadError(true);
      setQuickRecordStatus(t("sync.householdUnavailable"));
      return false;
    }

    updateFlower(flower);
    if (message) {
      setQuickRecordStatus(message);
    }
    return true;
  };

  const addFlower = async (flower: Flower) => {
    if (!isHouseholdOperationCurrent()) return false;
    if (supabaseWriteMode === "supabase-first" && supabaseReadState) {
      const saved = await upsertSupabasePlantFromFlower(supabaseReadState.household.id, flower);
      if (!isHouseholdOperationCurrent()) return false;
      const displayFlower = flower;
      setSupabaseReadState((current) => current ? {
        ...current,
        allFlowers: [displayFlower, ...current.allFlowers.filter((item) => item.id !== flower.id)],
        customFlowers: [displayFlower, ...current.customFlowers.filter((item) => item.id !== flower.id)],
        supabasePlantIdsByLegacyId: { ...current.supabasePlantIdsByLegacyId, [flower.id]: saved.id },
      } : current);
      // Creation is committed. A later refresh failure must not invite a duplicate retry.
      await refreshSupabaseReadState().catch(() => {
        if (isHouseholdOperationCurrent()) setSupabaseReadError(true);
      });
      return true;
    }
    if (isSupabaseOnlyDataMode) throw new Error(t("sync.customPlantUnavailable"));
    addCustomFlower(flower);
    return true;
  };

  const removeFlowerById = async (flowerId: string) => {
    if (!isHouseholdOperationCurrent()) return false;
    if (supabaseWriteMode === "supabase-first" && supabaseReadState) {
      const removed = await writeSupabaseFirst(
        () => setSupabasePlantRemoved(supabaseReadState.household.id, flowerId, true),
        () => removeFlower(flowerId),
      );
      return (Boolean(removed) || !isSupabaseOnlyDataMode) && isHouseholdOperationCurrent();
    }

    if (isSupabaseOnlyDataMode) {
      setSupabaseReadError(true);
      setQuickRecordStatus(t("sync.removeUnavailable"));
      return false;
    }

    removeFlower(flowerId);
    return true;
  };
  return { updateCareRecord, saveQuickRecord, saveFlower, addFlower, removeFlowerById };
};
