import {
  ChevronRight,
  Home,
  Leaf,
  Settings,
  UserRound,
  UsersRound,
  X
} from "lucide-react";
import { LoadingButton } from "../../../components/LoadingButton";
import { ModalDialog } from "../../../components/ModalDialog";
import type { Flower } from "../../../data/flowers";
import { useAuth } from "../../../hooks/useAuth";
import { createTranslator } from "../../../lib/i18n";
import type { HouseholdMember } from "../../../lib/plantieRepository";
import type { HouseholdNameEditSurface } from "../types";

type Props = {
  isSigningOut: boolean;
  isSavingHouseholdName: boolean;
  setIsHouseholdSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  t: ReturnType<typeof createTranslator>;
  renderHouseholdNameEditor: (surface: ("sheet" | "menu"), headingId?: string, showTrigger?: boolean) => JSX.Element;
  currentUserEmail: string;
  auth: ReturnType<typeof useAuth>;
  householdNameEditStatus: string;
  householdNameEditSurface: HouseholdNameEditSurface | null;
  householdNameEditStatusClass: string;
  renderHouseholdSwitcher: () => JSX.Element | null;
  householdMembers: HouseholdMember[];
  allFlowers: Flower[];
  handleAccountSignOut: () => Promise<void>;
};

export const HouseholdSheet = ({
  isSigningOut,
  isSavingHouseholdName,
  setIsHouseholdSheetOpen,
  t,
  renderHouseholdNameEditor,
  currentUserEmail,
  auth,
  householdNameEditStatus,
  householdNameEditSurface,
  householdNameEditStatusClass,
  renderHouseholdSwitcher,
  householdMembers,
  allFlowers,
  handleAccountSignOut
}: Props) => (
  <ModalDialog className="household-sheet" labelledBy="household-sheet-title" busy={isSigningOut || isSavingHouseholdName} onClose={() => setIsHouseholdSheetOpen(false)}>
    <button className="modal-close" type="button" disabled={isSigningOut || isSavingHouseholdName} onClick={() => setIsHouseholdSheetOpen(false)} aria-label={t("action.close")}>
      <X size={20} aria-hidden="true" />
    </button>
    <div className="household-sheet-hero">
      <span className="household-sheet-avatar" aria-hidden="true">
        <Home size={24} />
      </span>
      <div className="household-sheet-identity">
        <p className="eyebrow">{t("account.household")}</p>
        {renderHouseholdNameEditor("sheet", "household-sheet-title")}
        <p className="household-sheet-email">{currentUserEmail}</p>
        <span>{auth.isAuthenticated ? t("household.synced") : t("household.localGuest")}</span>
        {householdNameEditStatus && householdNameEditSurface !== "sheet" ? (
          <p className={householdNameEditStatusClass}>{householdNameEditStatus}</p>
        ) : null}
      </div>
    </div>
    {renderHouseholdSwitcher()}
    <div className="household-sheet-meta" aria-label={t("household.summary")}>
      <a href="#/menu?section=household" onClick={() => setIsHouseholdSheetOpen(false)}>
        <UsersRound size={17} aria-hidden="true" />
        <span>{householdMembers.length > 0 ? t("household.memberCount", { count: householdMembers.length }) : t("household.oneMember")}</span>
        <ChevronRight size={16} aria-hidden="true" />
      </a>
      <div className="household-sheet-meta-tile" aria-label={t("dashboard.tracked", { count: allFlowers.length })}>
        <Leaf size={17} aria-hidden="true" />
        <span>{t("dashboard.tracked", { count: allFlowers.length })}</span>
      </div>
    </div>
    <div className="household-sheet-actions">
      <a href="#/menu?section=household" onClick={() => setIsHouseholdSheetOpen(false)}>
        <Settings size={17} aria-hidden="true" />
        {t("household.settings")}
        <ChevronRight size={16} aria-hidden="true" />
      </a>
      {auth.isAuthenticated ? (
        <LoadingButton type="button" onClick={() => void handleAccountSignOut()} isLoading={isSigningOut} loadingLabel={t("account.signingOut")}>
          <UserRound size={17} aria-hidden="true" />
          {t("account.signOut")}
        </LoadingButton>
      ) : null}
    </div>
  </ModalDialog>
);
