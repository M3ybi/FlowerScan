export type DiagnosisConfidenceLevel = "low" | "medium" | "high";

export const normalizeDiagnosisConfidenceLevel = (value: unknown): DiagnosisConfidenceLevel | null => {
  if (value === "low" || value === "nizka" || value === "nízka") return "low";
  if (value === "medium" || value === "stredna" || value === "stredná") return "medium";
  if (value === "high" || value === "vysoka" || value === "vysoká") return "high";
  return null;
};
