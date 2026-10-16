const MiB = 1024 * 1024;
const initialQuality = 0.85;
const middleQuality = 0.75;
const minQuality = 0.65;

export const imageUploadConfig = {
  maxOriginalBytes: 15 * MiB,
  maxProcessedBytes: 2 * MiB,
  preferredProcessedBytes: MiB,
  supportedInputMimeTypes: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
  outputMimeType: "image/jpeg",
  maxDimension: 1600,
  maxSoftwareDecodePixels: 16_777_216,
  initialQuality,
  minQuality,
  // Each attempt encodes the original decoded bitmap, never a prior JPEG.
  compressionAttempts: [
    { scale: 1, quality: initialQuality },
    { scale: 1, quality: middleQuality },
    { scale: 1, quality: minQuality },
    { scale: 0.8, quality: minQuality },
    { scale: 0.64, quality: minQuality },
  ],
} as const;

export const maxProcessedBase64Length = 4 * Math.ceil(imageUploadConfig.maxProcessedBytes / 3);
export const maxImageDataUrlLength = "data:image/jpeg;base64,".length + maxProcessedBase64Length;
// Bounded allowance for JSON keys, household/plant IDs, language and notes.
export const maxImageRequestBytes = maxImageDataUrlLength + 16 * 1024;

export const detectImageMimeType = (bytes: Uint8Array): string | null => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
};

export const jpegDimensions = (bytes: Uint8Array): { width: number; height: number; hasPrivateMetadata: boolean } | null => {
  if (detectImageMimeType(bytes) !== "image/jpeg" || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return null;
  let offset = 2;
  let dimensions: { width: number; height: number; hasPrivateMetadata: boolean } | null = null;
  let hasPrivateMetadata = false;
  while (offset + 3 < bytes.length) {
    if (bytes[offset++] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return null;
    if ([0xe1, 0xed, 0xfe].includes(marker)) hasPrivateMetadata = true;
    if (marker === 0xda) return dimensions && offset + length < bytes.length - 2 ? { ...dimensions, hasPrivateMetadata } : null;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8) return null;
      dimensions = { height: (bytes[offset + 3] << 8) | bytes[offset + 4], width: (bytes[offset + 5] << 8) | bytes[offset + 6], hasPrivateMetadata };
      if (!dimensions.width || !dimensions.height) return null;
    }
    offset += length;
  }
  return null;
};

export const validateProcessedImageDataUrl = (value: unknown) => {
  if (typeof value !== "string") return { code: "INVALID_IMAGE", status: 400 } as const;
  if (value.length > maxImageDataUrlLength) return { code: "IMAGE_TOO_LARGE", status: 413 } as const;
  const match = value.match(/^data:([^;,]+);base64,([a-z0-9+/]*={0,2})$/i);
  if (!match) return { code: "INVALID_IMAGE", status: 400 } as const;
  if (!["image/jpeg", "image/jpg"].includes(match[1].toLowerCase())) return { code: "UNSUPPORTED_IMAGE_FORMAT", status: 415 } as const;
  const encoded = match[2];
  if (encoded.length > maxProcessedBase64Length) return { code: "IMAGE_TOO_LARGE", status: 413 } as const;
  if (!encoded.length || encoded.length % 4 !== 0) return { code: "INVALID_IMAGE", status: 400 } as const;
  const decodedLength = encoded.length / 4 * 3 - (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
  if (decodedLength > imageUploadConfig.maxProcessedBytes) return { code: "IMAGE_TOO_LARGE", status: 413 } as const;
  try {
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    if (bytes.length > imageUploadConfig.maxProcessedBytes) return { code: "IMAGE_TOO_LARGE", status: 413 } as const;
    const mime = detectImageMimeType(bytes);
    if (mime && mime !== imageUploadConfig.outputMimeType) return { code: "UNSUPPORTED_IMAGE_FORMAT", status: 415 } as const;
    const dimensions = jpegDimensions(bytes);
    if (!dimensions || dimensions.hasPrivateMetadata || Math.max(dimensions.width, dimensions.height) > imageUploadConfig.maxDimension) return { code: "INVALID_IMAGE", status: 400 } as const;
    return { bytes, contentType: imageUploadConfig.outputMimeType, ...dimensions } as const;
  } catch {
    return { code: "INVALID_IMAGE", status: 400 } as const;
  }
};
