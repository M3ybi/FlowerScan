import {
  currentHouseholdBaseUrl
} from "../../../app/appFormatting";
import type { CarePreview } from "../../../app/carePresentation";
import { HouseholdSwitcher } from "../../../components/HouseholdSwitcher";
import { useAuth } from "../../../hooks/useAuth";
import { useHouseholdDirectory } from "../../../hooks/useHouseholdDirectory";
import { browserStorage } from "../../../lib/browserStorage.js";
import { householdInvitationCopy } from "../../../lib/householdInvitationCopy";
import { writeSelectedHouseholdId } from "../../../lib/householdSelection";
import { createTranslator } from "../../../lib/i18n";
import { clearInvitationAuthContext } from "../../../lib/invitationAuthContext";
import type { HouseholdInvite, HouseholdMember } from "../../../lib/plantieRepository";
import type { SupabaseReadThroughState } from "../../../lib/supabaseReadThrough";
import {
  invalidateSupabaseReadThroughCache
} from "../../../lib/supabaseReadThrough";
import type { HouseholdSession } from "../../../utils/household";
import {
  createHouseholdUrl,
  storeHouseholdSession
} from "../../../utils/household";
import type { HouseholdLookupStatus } from "../types";

type Dependencies = {
  householdDirectory: ReturnType<typeof useHouseholdDirectory>;
  auth: ReturnType<typeof useAuth>;
  householdDataGenerationRef: React.MutableRefObject<number>;
  clearTransientMessages: () => void;
  resetHouseholdOperations: () => void;
  setHouseholdLookupStatus: React.Dispatch<React.SetStateAction<HouseholdLookupStatus>>;
  setIsAccessChecking: React.Dispatch<React.SetStateAction<boolean>>;
  setSupabaseReadState: React.Dispatch<React.SetStateAction<SupabaseReadThroughState | null>>;
  setSupabaseReadError: React.Dispatch<React.SetStateAction<boolean>>;
  setSupabasePlantIdsByLegacyId: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setHouseholdMembers: React.Dispatch<React.SetStateAction<HouseholdMember[]>>;
  setHouseholdInvites: React.Dispatch<React.SetStateAction<HouseholdInvite[]>>;
  setHouseholdPeopleError: React.Dispatch<React.SetStateAction<string>>;
  setHouseholdNameEditSurface: React.Dispatch<React.SetStateAction<("sheet" | "menu") | null>>;
  setIsInvitePanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setInviteEmail: React.Dispatch<React.SetStateAction<string>>;
  setIsAddPlantModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsDiagnosisModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setCarePreview: React.Dispatch<React.SetStateAction<CarePreview | null>>;
  setDeleteFlowerId: React.Dispatch<React.SetStateAction<string>>;
  setEditingNameFlowerId: React.Dispatch<React.SetStateAction<string>>;
  setOpenDiagnosticId: React.Dispatch<React.SetStateAction<string>>;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  setCloudSyncEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setCloudSyncReady: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveHousehold: React.Dispatch<React.SetStateAction<HouseholdSession | null>>;
  setBaseUrl: React.Dispatch<React.SetStateAction<string>>;
  setIsHouseholdSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsInvitationInboxOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedInboxInvitationId: React.Dispatch<React.SetStateAction<string | null>>;
  activeHousehold: HouseholdSession | null;
  t: ReturnType<typeof createTranslator>;
  invitationCopy: ReturnType<typeof householdInvitationCopy>;
};

export const useHouseholdSelectionActions = ({
  householdDirectory,
  auth,
  householdDataGenerationRef,
  clearTransientMessages,
  resetHouseholdOperations,
  setHouseholdLookupStatus,
  setIsAccessChecking,
  setSupabaseReadState,
  setSupabaseReadError,
  setSupabasePlantIdsByLegacyId,
  setHouseholdMembers,
  setHouseholdInvites,
  setHouseholdPeopleError,
  setHouseholdNameEditSurface,
  setIsInvitePanelOpen,
  setInviteEmail,
  setIsAddPlantModalOpen,
  setIsDiagnosisModalOpen,
  setCarePreview,
  setDeleteFlowerId,
  setEditingNameFlowerId,
  setOpenDiagnosticId,
  setQuery,
  setCloudSyncEnabled,
  setCloudSyncReady,
  setActiveHousehold,
  setBaseUrl,
  setIsHouseholdSheetOpen,
  setIsInvitationInboxOpen,
  setSelectedInboxInvitationId,
  activeHousehold,
  t,
  invitationCopy
}: Dependencies) => {
  const selectHousehold = (householdId: string) => {
    const selected = householdDirectory.households.find((household) => household.id === householdId);
    if (!selected || !auth.user?.id) return;
    householdDataGenerationRef.current += 1;
    invalidateSupabaseReadThroughCache();
    clearTransientMessages();
    resetHouseholdOperations();
    setHouseholdLookupStatus("complete");
    setIsAccessChecking(false);
    setSupabaseReadState(null);
    setSupabaseReadError(false);
    setSupabasePlantIdsByLegacyId({});
    setHouseholdMembers([]);
    setHouseholdInvites([]);
    setHouseholdPeopleError("");
    setHouseholdNameEditSurface(null);
    setIsInvitePanelOpen(false);
    setInviteEmail("");
    setIsAddPlantModalOpen(false);
    setIsDiagnosisModalOpen(false);
    setCarePreview(null);
    setDeleteFlowerId("");
    setEditingNameFlowerId("");
    setOpenDiagnosticId("");
    setQuery("");
    setCloudSyncEnabled(false);
    setCloudSyncReady(false);
    const session = { name: selected.name, publicToken: selected.id };
    storeHouseholdSession(session);
    writeSelectedHouseholdId(browserStorage, auth.user.id, selected.id);
    setActiveHousehold(session);
    setBaseUrl(currentHouseholdBaseUrl(selected.id));
    setIsHouseholdSheetOpen(false);
    setIsInvitationInboxOpen(false);
    setSelectedInboxInvitationId(null);
    clearInvitationAuthContext(browserStorage);
    window.history.replaceState(null, "", createHouseholdUrl(selected.id, "#/"));
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };

  const renderHouseholdSwitcher = () => auth.isAuthenticated ? <>
    <HouseholdSwitcher households={householdDirectory.households} currentHouseholdId={activeHousehold?.publicToken ?? null} loading={householdDirectory.loading} label={t("household.myHouseholds")} onSelect={selectHousehold} />
    {householdDirectory.error ? <p role="alert">{t("household.directoryLoadFailed")} <button className="text-action" type="button" onClick={() => void householdDirectory.refresh()}>{invitationCopy.retry}</button></p> : null}
  </> : null;

  const changeHousehold = () => {
    setIsHouseholdSheetOpen(true);
    void householdDirectory.refresh();
  };
  return { selectHousehold, renderHouseholdSwitcher, changeHousehold };
};
