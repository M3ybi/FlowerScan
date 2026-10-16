import { useEffect, useRef } from "react";
import { ImagePlus } from "lucide-react";
import { detectImageRuntime } from "../lib/imageCaptureService.js";
import type { ImageCaptureSource, ImagePickerLabels } from "../lib/imageCaptureService.js";
import { logImageProcessingFailure } from "../lib/imageUploadErrors.js";

type Props = {
  title: string;
  help: string;
  cameraLabel: string;
  galleryLabel: string;
  cancelLabel: string;
  disabled?: boolean;
  busy?: boolean;
  onSelect: (source: ImageCaptureSource, file?: File, pickerLabels?: ImagePickerLabels) => Promise<void>;
  onCancel: () => void;
};

export const ImageSourcePicker = ({ title, help, cameraLabel, galleryLabel, cancelLabel, disabled, busy, onSelect, onCancel }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => onCancel(), [onCancel]);
  const select = () => {
    if (detectImageRuntime() !== "web") void onSelect("prompt", undefined, { camera: cameraLabel, gallery: galleryLabel, cancel: cancelLabel }).catch((error: unknown) => logImageProcessingFailure("native-picker", error));
    else inputRef.current?.click();
  };
  const receive = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    if (!file || disabled || busy) return;
    // Start reading in the change event. Keep this input mounted and enabled
    // until reading completes; the selected File can belong to an OS provider.
    try { await onSelect("prompt", file); }
    catch (error) { logImageProcessingFailure("selection", error, { runtime: detectImageRuntime(), inputMime: file.type, originalBytes: file.size }); }
    finally { input.value = ""; }
  };
  return (
    <div className="image-source-picker">
      <button type="button" className="image-upload" disabled={disabled || busy} aria-busy={busy || undefined} onClick={select}>
        <span className="image-upload-icon"><ImagePlus size={22} aria-hidden="true" /></span>
        <span className="image-upload-copy"><strong>{title}</strong><small>{help}</small></span>
      </button>
      {/* Request compatible Photos exports, JPEG first. Opaque provider exports
          retain Chrome's external camera/Files chooser. The hint is not trusted:
          original HEIC/HEIF and stale MIME metadata still pass through decoding. */}
      <input ref={inputRef} type="file" hidden accept="image/jpeg,image/png,image/webp,application/octet-stream"
        aria-label={title} onChange={(event) => { void receive(event.currentTarget); }} />
    </div>
  );
};
