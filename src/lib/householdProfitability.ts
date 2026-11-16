export type JourneyCosts = { initial: number; refresh: number; diagnosis: number; safety: number | null };
export type FinancialAssumptions = {
  monthlyPriceEur: number; vatRate: number; commissionRate: number; processingRate: number; processingFixedEur: number;
  revenueCatRate: number; refundRate: number; usdPerEur: number; infrastructureEur: number; freeAllocationEur: number; supportEur: number;
};
// Scenario assumptions, not observed deductions, exchange rates or receipts.
export const defaultFinancialAssumptions: FinancialAssumptions = {
  monthlyPriceEur: 3.99, vatRate: .23, commissionRate: .30, processingRate: 0, processingFixedEur: 0,
  revenueCatRate: .01, refundRate: .03, usdPerEur: 1.1, infrastructureEur: .10, freeAllocationEur: .05, supportEur: .05,
};
export const scanVolumes = [10, 30, 100, 300, 500, 750, 1000, 3000] as const;
export const profitabilityScenarios = [
  { id: "cold_diagnosis", label: "Cold new-photo diagnosis", initial: 0, refresh: 0, diagnosis: 1, safety: 1 },
  { id: "new_plant", label: "New plant identification and save", initial: 1, refresh: 0, diagnosis: 0, safety: 1 },
  { id: "mixed", label: "Mixed household usage", initial: .4, refresh: .2, diagnosis: .4, safety: .8 },
  { id: "mostly_refresh", label: "Mostly care refresh", initial: .1, refresh: .8, diagnosis: .1, safety: .2 },
  { id: "reuse", label: "90% identical-result replay; 90% safety reuse", initial: .01, refresh: .07, diagnosis: .02, safety: .1 },
  { id: "failures", label: "30% extra charged failed/replacement attempts", initial: .52, refresh: .26, diagnosis: .52, safety: 1.04 },
  { id: "stress", label: "Unique diagnosis plus care; no reuse", initial: .5, refresh: .5, diagnosis: 1, safety: 1.5 },
] as const;

export const projectHouseholdEconomics = (costs: JourneyCosts, assumptions: FinancialAssumptions = defaultFinancialAssumptions) => {
  if (Object.values(costs).some(value => value !== null && (!Number.isFinite(value) || value < 0))
    || Object.values(assumptions).some(value => !Number.isFinite(value) || value < 0) || assumptions.usdPerEur <= 0
    || [assumptions.commissionRate, assumptions.processingRate, assumptions.revenueCatRate, assumptions.refundRate].some(rate => rate > 1))
    throw new Error("Invalid financial assumptions");
  const grossExVat = assumptions.monthlyPriceEur / (1 + assumptions.vatRate);
  // RevenueCat MTR and web processing use gross sales in this conservative
  // scenario. Do not incorrectly charge RevenueCat only on store net proceeds.
  const afterDeductions = grossExVat * (1 - assumptions.commissionRate) * (1 - assumptions.refundRate)
    - assumptions.monthlyPriceEur * (assumptions.processingRate + assumptions.revenueCatRate) - assumptions.processingFixedEur;
  const beforeAi = afterDeductions - assumptions.infrastructureEur - assumptions.freeAllocationEur - assumptions.supportEur;
  return profitabilityScenarios.flatMap(scenario => {
    const generationUsd = scenario.initial * costs.initial + scenario.refresh * costs.refresh + scenario.diagnosis * costs.diagnosis;
    const unitUsd = costs.safety === null ? null : generationUsd + scenario.safety * costs.safety;
    return scanVolumes.map(scans => ({ scenario: scenario.id, label: scenario.label, scans, unitUsd,
      aiUsd: unitUsd === null ? null : scans * unitUsd,
      contributionEur: unitUsd === null ? null : beforeAi - scans * unitUsd / assumptions.usdPerEur,
      breakEvenScans: unitUsd === null || unitUsd === 0 ? null : Math.max(0, Math.floor(beforeAi * assumptions.usdPerEur / unitUsd)),
      availableBeforeAiEur: beforeAi, projected: true as const,
    }));
  });
};
