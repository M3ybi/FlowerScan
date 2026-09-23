export const flowerPath = (flowerId: string, scan = false, panel: "diagnostics" | "" = "") => {
  const params = new URLSearchParams();
  if (scan) {
    params.set("scan", "1");
  }
  if (panel) {
    params.set("panel", panel);
  }

  const query = params.toString();
  return `#/flower/${encodeURIComponent(flowerId)}${query ? `?${query}` : ""}`;
};

export const flowerUrl = (flowerId: string) => {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}${flowerPath(flowerId)}`;
};
