const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export const isIsoDate = (value: string) => isoDatePattern.test(value);

export const formatDate = (value: string) => {
  if (!isIsoDate(value)) {
    return "Nezadané";
  }

  return new Intl.DateTimeFormat("sk-SK", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
};

export const formatElapsedDays = (value: number | null) => {
  if (value === null) {
    return "Nové";
  }

  if (value === 0) {
    return "dnes";
  }

  if (value === 1) {
    return "pred 1 dňom";
  }

  if (value > 1 && value < 5) {
    return `pred ${value} dňami`;
  }

  return `pred ${value} dňami`;
};

export const addDays = (value: string, days: number) => {
  if (!isIsoDate(value)) {
    return "";
  }

  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
};

export const daysSince = (value: string) => {
  if (!isIsoDate(value)) {
    return null;
  }

  const wateredDate = new Date(`${value}T00:00:00`);
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = todayMidnight.getTime() - wateredDate.getTime();

  return Math.max(0, Math.floor(diff / 86_400_000));
};
