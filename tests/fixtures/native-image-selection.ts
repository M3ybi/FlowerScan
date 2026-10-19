import { captureImage, detectImageRuntime } from "../../src/lib/imageCaptureService";
import { ImageUploadError, isImageSelectionCancelled } from "../../src/lib/imageUploadErrors";

// Offline native acquisition fixture, never included by the application build.
// It exercises the actual Camera bridge and normalizer, without Auth, AI, quota,
// Storage or database operations. It cannot establish an end-to-end upload pass.
const state = { runtime: detectImageRuntime(), add: 0, diagnosis: 0, cancelled: 0, busy: false, error: null as null | { code: string; stage?: string } };
Object.assign(window, { __nativeImageFixture: state });
const output = document.querySelector("output")!;
const render = () => { output.textContent = JSON.stringify(state); };
for (const kind of ["add", "diagnosis"] as const) {
  document.getElementById(kind)!.addEventListener("click", async () => {
    if (state.busy) return;
    state.busy = true; state.error = null; render();
    try {
      const image = await captureImage({ source: "gallery" });
      if (image) { state[kind]++; URL.revokeObjectURL(image.previewUrl); }
    } catch (error) {
      if (isImageSelectionCancelled(error)) state.cancelled++;
      else state.error = error instanceof ImageUploadError ? { code: error.code, stage: error.stage } : { code: "UNEXPECTED_FIXTURE_ERROR" };
    } finally { state.busy = false; render(); }
  });
}
render();
