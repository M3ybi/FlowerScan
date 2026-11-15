import type { BotanicalTask } from "./botanicalPromptCandidates.ts";

// Review signals for isolated experiments. This is not a botanical oracle or
// a production filter; absence of a signal never establishes treatment safety.
export const botanicalConsistencySignals = (task: BotanicalTask, value: Record<string, unknown>) => {
  const signals: string[] = [];
  if (task === "care") {
    const text = typeof value.watering === "string" ? value.watering : "";
    const patterns = [
      /\bwater\s+every\s+(\d{1,2})\s+days?\b/giu,
      /\bzalievaj(?:te)?\s+každ[éýých]+\s+(\d{1,2})\s+dn[íi](?=$|[\s.,;!?])/giu,
      /\b(?:gieße|gießen|gießt)\s+alle\s+(\d{1,2})\s+Tage\b/giu,
      /\b(?:arrosez|arroser)\s+tous\s+les\s+(\d{1,2})\s+jours\b/giu,
      /\b(?:riega|regar|riegue)\s+cada\s+(\d{1,2})\s+días\b/giu,
    ];
    if (patterns.some(pattern => Array.from(text.matchAll(pattern)).some(match => Number(match[1]) !== value.wateringIntervalDays))
      || /\b(?:water daily|zalievaj denne|täglich gießen|arroser quotidiennement|regar diariamente)\b/iu.test(text)) signals.push("EXPLICIT_WATERING_INTERVAL_CONFLICT");
    if (value.identificationConfidence === "needs-confirmation" && typeof value.identificationNote === "string"
      && /\b(?:definitely is|certainly is|zweifellos|sin duda es)\b/iu.test(value.identificationNote)) signals.push("UNQUALIFIED_IDENTITY_REQUIRES_REVIEW");
  } else {
    const score = value.confidence;
    if (typeof score === "number") {
      const band = score < 40 ? "low" : score < 75 ? "medium" : "high";
      if (value.confidence_label !== band) signals.push("CANDIDATE_CONFIDENCE_BAND_CONFLICT");
    }
  }
  return signals;
};
