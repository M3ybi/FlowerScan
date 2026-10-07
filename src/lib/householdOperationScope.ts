export type HouseholdOperationScope = {
  userId: string | null;
  householdToken: string | null;
  generation: number;
};

// The generation also changes before React renders the newly selected household.
export const isCurrentHouseholdOperationScope = (
  started: HouseholdOperationScope,
  current: HouseholdOperationScope,
  currentGeneration: number,
) => started.userId === current.userId &&
  started.householdToken === current.householdToken &&
  started.generation === currentGeneration;
