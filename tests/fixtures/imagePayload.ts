export const jpegFixtureBase64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAADAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDKooorxzwj/9k=";
export const jpegFixtureBytes = Uint8Array.from(atob(jpegFixtureBase64), (c) => c.charCodeAt(0));
// Valid JPEG APP2 segments let size-boundary tests use exact decoded lengths.
export const jpegFixtureAtSize = (size: number) => {
  if (size < jpegFixtureBytes.length + 4) return jpegFixtureBytes;
  const bytes = new Uint8Array(size);
  bytes.set(jpegFixtureBytes.slice(0, 2));
  let offset = 2;
  let remaining = size - jpegFixtureBytes.length;
  while (remaining > 0) {
    let segmentSize = Math.min(65537, remaining);
    if (remaining - segmentSize > 0 && remaining - segmentSize < 4) segmentSize -= 4;
    bytes.set([0xff, 0xe2, (segmentSize - 2) >> 8, (segmentSize - 2) & 255], offset);
    offset += segmentSize;
    remaining -= segmentSize;
  }
  bytes.set(jpegFixtureBytes.slice(2), offset);
  return bytes;
};
export const fixtureDataUrl = (bytes = jpegFixtureBytes) => {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.slice(offset, offset + 32768));
  return `data:image/jpeg;base64,${btoa(binary)}`;
};
