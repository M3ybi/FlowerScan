export const visionVariants = Object.freeze([
  { id: "baseline_1600_high", maxDimension: 1600, detail: "high" },
  { id: "a_1280_high", maxDimension: 1280, detail: "high" },
  { id: "b_1024_high", maxDimension: 1024, detail: "high" },
  { id: "c_768_high", maxDimension: 768, detail: "high" },
  { id: "d_512_low", maxDimension: 512, detail: "low" },
  { id: "e_original_low", maxDimension: 1600, detail: "low" },
]);

// Documented GPT-4o image-only estimates, NEVER an actual usage measurement or
// the financial admission bound. https://developers.openai.com/api/docs/guides/images-vision
export const estimateGpt4oImageTokens = (width, height, detail) => {
  if (![width,height].every(n => Number.isSafeInteger(n) && n > 0) || !["high","low"].includes(detail)) throw new Error("Invalid image geometry");
  if (detail === "low") return { estimatedImageTokens: 85, tiles: 0, detail };
  let scale = Math.min(1, 2048 / Math.max(width,height));
  let w = width * scale, h = height * scale;
  if (Math.min(w,h) > 768) { scale = 768 / Math.min(w,h); w *= scale; h *= scale; }
  w = Math.max(1,Math.floor(w)); h = Math.max(1,Math.floor(h));
  const tiles = Math.ceil(w/512)*Math.ceil(h/512);
  return { estimatedImageTokens: 85+170*tiles, tiles, detail, resizedWidth: w, resizedHeight: h };
};

export const resizeDimensions = (width,height,maxDimension) => {
  if (![width,height,maxDimension].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error("Invalid resize geometry");
  const scale = Math.min(1,maxDimension/Math.max(width,height));
  return { width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale)) };
};
