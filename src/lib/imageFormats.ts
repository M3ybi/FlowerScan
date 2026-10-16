// ISO BMFF containers may precede ftyp with padding and use extended lengths.
export const detectDeviceImageMimeType = (bytes: Uint8Array): string | null => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  for (let offset = 0; offset + 8 <= Math.min(bytes.length, 4096);) {
    const type = text(offset + 4);
    let length = view.getUint32(offset), header = 8;
    if (length === 1) {
      if (offset + 16 > bytes.length || view.getUint32(offset + 8) !== 0) return null;
      length = view.getUint32(offset + 12); header = 16;
    }
    if (!length) length = bytes.length - offset;
    if (length < header || offset + length > bytes.length) return null;
    if (type === "ftyp") {
      if (length < header + 8) return null;
      const brands = [text(offset + header)];
      for (let i = offset + header + 8; i + 4 <= Math.min(offset + length, offset + 256); i += 4) brands.push(text(i));
      if (brands.some(brand => ["avif", "avis"].includes(brand))) return "image/avif";
      if (brands.some(brand => ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"].includes(brand))) return "image/heic";
      if (brands.some(brand => ["mif1", "msf1"].includes(brand))) return "image/heif";
      return null;
    }
    if (!["free", "skip", "wide"].includes(type)) return null;
    offset += length;
  }
  return null;
};

// Only sanitize freshly encoded pixels, after orientation has been applied.
// Preserve compressed scan data and color profiles; discard EXIF/XMP/IPTC/COM.
export const stripEncodedJpegMetadata = (bytes: Uint8Array): Uint8Array => {
  if (bytes[0] !== 255 || bytes[1] !== 216) return bytes;
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2, changed = false;
  while (offset + 3 < bytes.length) {
    const start = offset;
    if (bytes[offset++] !== 255) return bytes;
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 218) {
      if (!changed) return bytes;
      parts.push(bytes.subarray(start));
      const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
      let index = 0;
      for (const part of parts) { result.set(part, index); index += part.length; }
      return result;
    }
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return bytes;
    offset += length;
    if ([225, 237, 254].includes(marker)) changed = true;
    else parts.push(bytes.subarray(start, offset));
  }
  return bytes; // Malformed outputs still fail the strict JPEG validator.
};
