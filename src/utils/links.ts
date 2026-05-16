export const flowerPath = (flowerId: string, scan = false) =>
  `#/flower/${encodeURIComponent(flowerId)}${scan ? "?scan=1" : ""}`;

export const flowerUrl = (flowerId: string) => {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}${flowerPath(flowerId)}`;
};
