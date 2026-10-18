const names = new Set(["Error", "TypeError", "SyntaxError", "AbortError", "TimeoutError", "ImageUploadError"]);

// Provider/database messages can contain submitted notes, addresses or URLs.
export const safeFailureMetadata = (error: unknown) => ({
  code: "CLIENT_REQUEST_FAILED",
  name: error instanceof Error && names.has(error.name) ? error.name : "UnknownError",
});
