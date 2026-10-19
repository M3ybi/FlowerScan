import {
  Check,
  Pencil,
  X
} from "lucide-react";
import { LoadingButton } from "../../../components/LoadingButton";
import { useHouseholdDirectory } from "../../../hooks/useHouseholdDirectory";
import { householdNameMaxLength, validateHouseholdName } from "../../../lib/householdNameValidation";
import type { HouseholdPermissions } from "../../../lib/householdPermissions";
import { createTranslator } from "../../../lib/i18n";
import type { Household } from "../../../lib/plantieRepository";
import {
  renameHousehold
} from "../../../lib/plantieRepository";
import type { SupabaseReadThroughState } from "../../../lib/supabaseReadThrough";
import {
  invalidateSupabaseReadThroughCache
} from "../../../lib/supabaseReadThrough";
import type { HouseholdSession } from "../../../utils/household";
import {
  storeHouseholdSession
} from "../../../utils/household";

type Dependencies = {
  setSupabaseReadState: React.Dispatch<React.SetStateAction<SupabaseReadThroughState | null>>;
  setActiveHousehold: React.Dispatch<React.SetStateAction<HouseholdSession | null>>;
  setHouseholdNameDraft: React.Dispatch<React.SetStateAction<string>>;
  householdDirectory: ReturnType<typeof useHouseholdDirectory>;
  setHouseholdNameEditDraft: React.Dispatch<React.SetStateAction<string>>;
  householdDisplayName: string;
  setHouseholdNameEditStatus: React.Dispatch<React.SetStateAction<string>>;
  setHouseholdNameEditStatusTone: React.Dispatch<React.SetStateAction<"error" | "info" | "success">>;
  setHouseholdNameEditSurface: React.Dispatch<React.SetStateAction<("sheet" | "menu") | null>>;
  isHouseholdOperationCurrent: (started?: { userId: string | null; householdToken: string | null; generation: number; }) => boolean;
  isSavingHouseholdName: boolean;
  activeSupabaseHouseholdId: string;
  householdPermissions: HouseholdPermissions;
  t: ReturnType<typeof createTranslator>;
  householdNameEditDraft: string;
  transientMessageGenerationRef: React.MutableRefObject<number>;
  setIsSavingHouseholdName: React.Dispatch<React.SetStateAction<boolean>>;
  isTransientMessageGenerationCurrent: (generation: number) => boolean;
  householdNameEditSurface: ("sheet" | "menu") | null;
  householdNameEditStatus: string;
  householdNameEditStatusTone: "error" | "info" | "success";
  householdNameEditStatusClass: string;
  canRenameHousehold: boolean;
};

export const useHouseholdManagement = ({
  setSupabaseReadState,
  setActiveHousehold,
  setHouseholdNameDraft,
  householdDirectory,
  setHouseholdNameEditDraft,
  householdDisplayName,
  setHouseholdNameEditStatus,
  setHouseholdNameEditStatusTone,
  setHouseholdNameEditSurface,
  isHouseholdOperationCurrent,
  isSavingHouseholdName,
  activeSupabaseHouseholdId,
  householdPermissions,
  t,
  householdNameEditDraft,
  transientMessageGenerationRef,
  setIsSavingHouseholdName,
  isTransientMessageGenerationCurrent,
  householdNameEditSurface,
  householdNameEditStatus,
  householdNameEditStatusTone,
  householdNameEditStatusClass,
  canRenameHousehold
}: Dependencies) => {
  const applyRenamedHousehold = (household: Household) => {
    setSupabaseReadState((current) =>
      current?.household.id === household.id
        ? {
          ...current,
          household,
        }
        : current,
    );
    setActiveHousehold((current) => {
      if (!current || (current.publicToken !== household.id && current.publicToken !== household.legacyPublicToken)) {
        return current;
      }

      const next = { ...current, name: household.name };
      storeHouseholdSession(next);
      return next;
    });
    setHouseholdNameDraft(household.name);
    invalidateSupabaseReadThroughCache();
    void householdDirectory.refresh(true);
  };

  const startHouseholdNameEdit = (surface: ("sheet" | "menu")) => {
    setHouseholdNameEditDraft(householdDisplayName);
    setHouseholdNameEditStatus("");
    setHouseholdNameEditStatusTone("info");
    setHouseholdNameEditSurface(surface);
  };

  const cancelHouseholdNameEdit = () => {
    setHouseholdNameEditDraft("");
    setHouseholdNameEditStatus("");
    setHouseholdNameEditStatusTone("info");
    setHouseholdNameEditSurface(null);
  };

  const handleSaveHouseholdName = async () => {
    if (!isHouseholdOperationCurrent()) return;
    if (isSavingHouseholdName) {
      return;
    }

    if (!activeSupabaseHouseholdId || !householdPermissions.canEditHousehold) {
      setHouseholdNameEditStatus(t("household.renamePermission"));
      setHouseholdNameEditStatusTone("error");
      return;
    }

    const nameValidation = validateHouseholdName(householdNameEditDraft);
    if (!nameValidation.valid && nameValidation.reason === "required") {
      setHouseholdNameEditStatus(t("household.renameRequired"));
      setHouseholdNameEditStatusTone("error");
      return;
    }

    if (!nameValidation.valid && nameValidation.reason === "too_long") {
      setHouseholdNameEditStatus(t("household.renameTooLong", { count: householdNameMaxLength }));
      setHouseholdNameEditStatusTone("error");
      return;
    }

    if (!nameValidation.valid) {
      setHouseholdNameEditStatus(t("household.renameUnsafe"));
      setHouseholdNameEditStatusTone("error");
      return;
    }

    const feedbackGeneration = transientMessageGenerationRef.current;

    try {
      setIsSavingHouseholdName(true);
      setHouseholdNameEditStatus(t("household.renameSaving"));
      setHouseholdNameEditStatusTone("info");
      const household = await renameHousehold(activeSupabaseHouseholdId, nameValidation.name);
      if (!isHouseholdOperationCurrent()) return;
      applyRenamedHousehold(household);
      if (!isTransientMessageGenerationCurrent(feedbackGeneration)) {
        return;
      }
      setHouseholdNameEditStatus(t("household.renameSaved"));
      setHouseholdNameEditStatusTone("success");
      setHouseholdNameEditSurface(null);
    } catch {
      if (isHouseholdOperationCurrent() && isTransientMessageGenerationCurrent(feedbackGeneration)) {
        setHouseholdNameEditStatus(t("household.renameFailed"));
        setHouseholdNameEditStatusTone("error");
      }
    } finally {
      if (isHouseholdOperationCurrent() && isTransientMessageGenerationCurrent(feedbackGeneration)) {
        setIsSavingHouseholdName(false);
      }
    }
  };

  const renderHouseholdNameEditor = (surface: ("sheet" | "menu"), headingId?: string, showTrigger = true) => {
    const isEditing = householdNameEditSurface === surface;
    const inputId = `household-name-${surface}`;
    const statusId = `household-name-status-${surface}`;

    if (isEditing) {
      return (
        <form
          className="household-name-edit-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSaveHouseholdName();
          }}
        >
          <label className="sr-only" htmlFor={inputId}>
            {t("household.renameLabel")}
          </label>
          <input
            aria-describedby={householdNameEditStatus ? statusId : undefined}
            aria-invalid={householdNameEditStatusTone === "error"}
            autoFocus
            disabled={isSavingHouseholdName}
            id={inputId}
            maxLength={householdNameMaxLength}
            type="text"
            value={householdNameEditDraft}
            onChange={(event) => setHouseholdNameEditDraft(event.target.value)}
          />
          <div className="household-name-edit-actions">
            <LoadingButton
              className="household-icon-action household-icon-action-save"
              type="submit"
              isLoading={isSavingHouseholdName}
              loadingLabel={<span className="sr-only">{t("household.renameSaving")}</span>}
              aria-label={t("household.renameSave")}
            >
              <Check size={16} aria-hidden="true" />
            </LoadingButton>
            <button
              className="household-icon-action"
              type="button"
              disabled={isSavingHouseholdName}
              onClick={cancelHouseholdNameEdit}
              aria-label={t("household.renameCancel")}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          {householdNameEditStatus ? (
            <p id={statusId} className={householdNameEditStatusClass}>
              {householdNameEditStatus}
            </p>
          ) : null}
        </form>
      );
    }

    return (
      <div className="household-name-row">
        {headingId ? (
          <h2 id={headingId}>{householdDisplayName}</h2>
        ) : (
          <strong className="household-name-display">{householdDisplayName}</strong>
        )}
        {canRenameHousehold && showTrigger ? (
          <button className="household-name-edit-trigger" type="button" onClick={() => startHouseholdNameEdit(surface)} aria-label={t("household.renameAction")}>
            <Pencil size={15} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    );
  };
  return { applyRenamedHousehold, startHouseholdNameEdit, cancelHouseholdNameEdit, handleSaveHouseholdName, renderHouseholdNameEditor };
};
