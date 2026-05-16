import { addDays, daysSince, isIsoDate } from "./dates";

export const getWateringProgress = (lastWatered: string, intervalDays: number) => {
  if (!isIsoDate(lastWatered)) {
    return {
      daysLeft: null,
      nextWatering: "",
      percent: 0,
      state: "unknown" as const,
      statusText: "Zálievka nezadaná",
    };
  }

  const elapsed = daysSince(lastWatered) ?? 0;
  const rawPercent = 100 - (elapsed / intervalDays) * 100;
  const percent = Math.max(0, Math.min(100, rawPercent));
  const daysLeft = intervalDays - elapsed;
  const nextWatering = addDays(lastWatered, intervalDays);

  if (daysLeft < 0) {
    return {
      daysLeft,
      nextWatering,
      percent,
      state: "overdue" as const,
      statusText: `mešká ${Math.abs(daysLeft)} d.`,
    };
  }

  if (daysLeft === 0) {
    return {
      daysLeft,
      nextWatering,
      percent,
      state: "due" as const,
      statusText: "zaliať dnes",
    };
  }

  if (percent <= 35) {
    return {
      daysLeft,
      nextWatering,
      percent,
      state: "soon" as const,
      statusText: `zaliať o ${daysLeft} d.`,
    };
  }

  return {
    daysLeft,
    nextWatering,
    percent,
    state: "ok" as const,
    statusText: `zaliať o ${daysLeft} d.`,
  };
};
