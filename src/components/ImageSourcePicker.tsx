import { useEffect, useId, useRef, useState } from "react";
import { Camera, ImagePlus } from "lucide-react";
import { detectImageRuntime } from "../lib/imageCaptureService.js";
import type { ImageCaptureSource } from "../lib/imageCaptureService.js";
import { logImageProcessingFailure } from "../lib/imageUploadErrors.js";

type Props = {
  title: string;
  help: string;
  cameraLabel: string;
  galleryLabel: string;
  disabled?: boolean;
  busy?: boolean;
  onSelect: (source: ImageCaptureSource, file?: File) => Promise<void>;
  onCancel: () => void;
};

export const ImageSourcePicker = ({ title, help, cameraLabel, galleryLabel, disabled, busy, onSelect, onCancel }: Props) => {
  const [expanded, setExpanded] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const id = useId();
  useEffect(() => () => onCancel(), [onCancel]);
  const select = (source: ImageCaptureSource) => {
    setExpanded(false);
    if (detectImageRuntime() !== "web") void onSelect(source).catch((error: unknown) => logImageProcessingFailure("native-selection", error));
    else (source === "camera" ? cameraInput : galleryInput).current?.click();
  };
  const receive = async (input: HTMLInputElement, source: ImageCaptureSource) => {
    const file = input.files?.[0];
    if (!file) return;
    try { await onSelect(source, file); }
    catch (error) { logImageProcessingFailure("web-selection", error); }
    finally { input.value = ""; }
  };
  return (
    <div className="image-source-picker">
      <button type="button" className="image-upload" disabled={disabled || busy} aria-busy={busy || undefined}
        aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded((value) => !value)}>
        <span className="image-upload-icon"><ImagePlus size={22} aria-hidden="true" /></span>
        <span className="image-upload-copy"><strong>{title}</strong><small>{help}</small></span>
      </button>
      {expanded ? <div id={id} className="image-capture-actions" role="group" aria-label={title}>
        <button type="button" className="ghost-action" disabled={disabled || busy} onClick={() => select("camera")}>
          <Camera size={17} aria-hidden="true" />{cameraLabel}
        </button>
        <button type="button" className="ghost-action" disabled={disabled || busy} onClick={() => select("gallery")}>
          <ImagePlus size={17} aria-hidden="true" />{galleryLabel}
        </button>
      </div> : null}
      {/* Browsers without direct capture support gracefully show a file picker. */}
      <input ref={cameraInput} type="file" hidden accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment"
        aria-label={cameraLabel} disabled={disabled || busy} onChange={(event) => { void receive(event.currentTarget, "camera"); }} />
      <input ref={galleryInput} type="file" hidden accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        aria-label={galleryLabel} disabled={disabled || busy} onChange={(event) => { void receive(event.currentTarget, "gallery"); }} />
    </div>
  );
};
