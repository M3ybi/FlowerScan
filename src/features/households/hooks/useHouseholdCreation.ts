import type { FormEvent } from "react";
import {
  currentHouseholdBaseUrl
} from "../../../app/appFormatting";
import { useAuth } from "../../../hooks/useAuth";
import { useHouseholdDirectory } from "../../../hooks/useHouseholdDirectory";
import { isLegacyNetlifyBackendEnabled, isSupabaseBackend } from "../../../lib/backendConfig";
import { browserStorage } from "../../../lib/browserStorage.js";
import { householdNameMaxLength, validateHouseholdName } from "../../../lib/householdNameValidation";
import { writeSelectedHouseholdId } from "../../../lib/householdSelection";
import { createTranslator } from "../../../lib/i18n";
import type { OnboardingStep } from "../../../lib/onboarding";
import {
  markOnboardingComplete
} from "../../../lib/onboarding";
import {
  createHousehold
} from "../../../lib/plantieRepository";
import {
  invalidateSupabaseReadThroughCache
} from "../../../lib/supabaseReadThrough";
import type { HouseholdSession } from "../../../utils/household";
import {
  createHouseholdUrl,
  isValidHouseholdToken,
  storeHouseholdSession
} from "../../../utils/household";
import type { HouseholdLookupStatus } from "../types";

type Dependencies = {
  isHouseholdOperationCurrent: (started?: { userId: string | null; householdToken: string | null; generation: number; }) => boolean;
  isCreatingHousehold: boolean;
  auth: ReturnType<typeof useAuth>;
  setAccessStatus: React.Dispatch<React.SetStateAction<string>>;
  t: ReturnType<typeof createTranslator>;
  setOnboardingStep: React.Dispatch<React.SetStateAction<OnboardingStep>>;
  householdNameDraft: string;
  transientMessageGenerationRef: React.MutableRefObject<number>;
  setIsCreatingHousehold: React.Dispatch<React.SetStateAction<boolean>>;
  householdDirectory: ReturnType<typeof useHouseholdDirectory>;
  householdDataGenerationRef: React.MutableRefObject<number>;
  resetHouseholdOperations: () => void;
  setHouseholdLookupStatus: React.Dispatch<React.SetStateAction<HouseholdLookupStatus>>;
  setIsAccessChecking: React.Dispatch<React.SetStateAction<boolean>>;
  isUuid: (value: string) => boolean;
  setActiveHousehold: React.Dispatch<React.SetStateAction<HouseholdSession | null>>;
  setBaseUrl: React.Dispatch<React.SetStateAction<string>>;
  isTransientMessageGenerationCurrent: (generation: number) => boolean;
  setIsNewOnboardingHousehold: React.Dispatch<React.SetStateAction<boolean>>;
  householdOperationScopeRef: React.MutableRefObject<{ userId: string | null; householdToken: string | null; generation: number; }>;
};

export const useHouseholdCreation = ({
  isHouseholdOperationCurrent,
  isCreatingHousehold,
  auth,
  setAccessStatus,
  t,
  setOnboardingStep,
  householdNameDraft,
  transientMessageGenerationRef,
  setIsCreatingHousehold,
  householdDirectory,
  householdDataGenerationRef,
  resetHouseholdOperations,
  setHouseholdLookupStatus,
  setIsAccessChecking,
  isUuid,
  setActiveHousehold,
  setBaseUrl,
  isTransientMessageGenerationCurrent,
  setIsNewOnboardingHousehold,
  householdOperationScopeRef
}: Dependencies) => {
  const handleCreateHousehold = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isHouseholdOperationCurrent()) return false;
    if (isCreatingHousehold) {
      return false;
    }

    if (!auth.isAuthenticated) {
      setAccessStatus(t("household.createRequiresAuth"));
      setOnboardingStep("welcome");
      return false;
    }

    const nameValidation = validateHouseholdName(householdNameDraft);
    if (!nameValidation.valid) {
      setAccessStatus(
        nameValidation.reason === "required"
          ? t("household.renameRequired")
          : nameValidation.reason === "too_long"
            ? t("household.renameTooLong", { count: householdNameMaxLength })
            : t("household.renameUnsafe"),
      );
      return false;
    }

    const feedbackGeneration = transientMessageGenerationRef.current;

    try {
      setIsCreatingHousehold(true);
      setAccessStatus(t("household.creating"));
      let household: HouseholdSession;

      if (auth.isAuthenticated && isSupabaseBackend) {
        const created = await createHousehold(nameValidation.name);
        household = { name: created.name, publicToken: created.id };
      } else if (isLegacyNetlifyBackendEnabled) {
        const response = await fetch("/.netlify/functions/household-access", {
          body: JSON.stringify({ name: nameValidation.name }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });

        if (!response.ok) {
          throw new Error(t("household.createFailed"));
        }

        const data = (await response.json()) as { household?: HouseholdSession };
        if (!data.household) {
          throw new Error(t("household.invalidResponse"));
        }
        household = data.household;
      } else {
        throw new Error(t("household.createRequiresAuth"));
      }

      if (!isValidHouseholdToken(household.publicToken)) {
        throw new Error(t("household.invalidResponse"));
      }

      if (!isHouseholdOperationCurrent()) return false;
      if (isSupabaseBackend) await householdDirectory.refresh(true);
      if (!isHouseholdOperationCurrent()) return false;
      householdDataGenerationRef.current += 1;
      invalidateSupabaseReadThroughCache();
      resetHouseholdOperations();
      setIsCreatingHousehold(false);
      setHouseholdLookupStatus("complete");
      setIsAccessChecking(false);
      storeHouseholdSession(household);
      if (auth.user?.id && isUuid(household.publicToken)) writeSelectedHouseholdId(browserStorage, auth.user.id, household.publicToken);
      window.history.replaceState(null, "", createHouseholdUrl(household.publicToken));
      setActiveHousehold(household);
      setBaseUrl(currentHouseholdBaseUrl(household.publicToken));
      setAccessStatus("");
      return true;
    } catch {
      if (isHouseholdOperationCurrent() && isTransientMessageGenerationCurrent(feedbackGeneration)) {
        setAccessStatus(t("household.createFailedRetry"));
      }
      return false;
    } finally {
      if (isHouseholdOperationCurrent() && isTransientMessageGenerationCurrent(feedbackGeneration)) {
        setIsCreatingHousehold(false);
        setIsAccessChecking(false);
      }
    }
  };

  const handleCreateOnboardingHousehold = async (event: FormEvent<HTMLFormElement>) => {
    const userId = auth.user?.id ?? null;
    setIsNewOnboardingHousehold(true);
    const created = await handleCreateHousehold(event);
    if (householdOperationScopeRef.current.userId !== userId || !created && !isHouseholdOperationCurrent()) return;
    if (created) {
      markOnboardingComplete(browserStorage);
      setOnboardingStep("complete");
    } else {
      setIsNewOnboardingHousehold(false);
    }
  };
  return { handleCreateHousehold, handleCreateOnboardingHousehold };
};
