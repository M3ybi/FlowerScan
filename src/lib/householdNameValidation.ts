export const householdNameMaxLength = 80;

const unsafeHouseholdNameTerms = [
  "cabron",
  "connard",
  "cono",
  "cunt",
  "fuck",
  "fick",
  "fotze",
  "hovno",
  "jeb",
  "joder",
  "kokot",
  "kurva",
  "merde",
  "mierda",
  "pendejo",
  "pica",
  "pi\u010da",
  "putain",
  "puta",
  "salope",
  "scheisse",
  "schei\u00dfe",
  "shit",
];

const normalizeHouseholdNameForSafety = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\u00df/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const normalizeHouseholdName = (name: string) => name.trim();

export const isHouseholdNameProfane = (name: string) => {
  const normalized = normalizeHouseholdNameForSafety(name);
  if (!normalized) {
    return false;
  }

  const padded = ` ${normalized} `;
  const compact = normalized.replace(/\s+/g, "");

  return unsafeHouseholdNameTerms.some((term) => {
    const normalizedTerm = normalizeHouseholdNameForSafety(term);
    return padded.includes(` ${normalizedTerm} `) || compact.includes(normalizedTerm);
  });
};

export const validateHouseholdName = (name: string) => {
  const normalizedName = normalizeHouseholdName(name);
  if (!normalizedName) {
    return { name: normalizedName, reason: "required" as const, valid: false as const };
  }

  if (normalizedName.length > householdNameMaxLength) {
    return { name: normalizedName, reason: "too_long" as const, valid: false as const };
  }

  if (isHouseholdNameProfane(normalizedName)) {
    return { name: normalizedName, reason: "unsafe" as const, valid: false as const };
  }

  return { name: normalizedName, valid: true as const };
};
