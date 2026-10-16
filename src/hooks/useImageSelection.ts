import { useCallback, useEffect, useRef, useState } from "react";
import { captureImage, detectImageRuntime } from "../lib/imageCaptureService.js";
import type { ImageCaptureSource, NormalizedImage } from "../lib/imageCaptureService.js";
import { ImageUploadError, imageErrorMessage, isImageSelectionCancelled, logImageProcessingFailure } from "../lib/imageUploadErrors.js";
import { validatePlantImageForUpload } from "../utils/imageUploadValidation.js";
import type { PlantieLanguage } from "../lib/onboarding.js";

type Options = {
  enabled: boolean;
  scopeKey: string;
  language: PlantieLanguage | null;
  onStatus: (status: string) => void;
  onReady?: () => void;
  copy: { processing: string; validating: string; ready: string };
};

export const useImageSelection = (options: Options) => {
  const latest = useRef(options);
  latest.current = options;
  const mounted = useRef(true);
  const operation = useRef<AbortController | null>(null);
  const ownedImage = useRef<NormalizedImage | null>(null);
  const status = useRef("");
  const [image, setImage] = useState<NormalizedImage | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const cancel = useCallback(() => {
    operation.current?.abort();
    operation.current = null;
    if (mounted.current) setIsProcessing(false);
  }, []);
  const clear = useCallback(() => {
    cancel();
    if (ownedImage.current) URL.revokeObjectURL(ownedImage.current.previewUrl);
    ownedImage.current = null;
    status.current = "";
    if (mounted.current) setImage(null);
  }, [cancel]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operation.current?.abort();
      operation.current = null;
      if (ownedImage.current) URL.revokeObjectURL(ownedImage.current.previewUrl);
      ownedImage.current = null;
    };
  }, []);
  useEffect(() => { clear(); }, [options.scopeKey, clear]);
  useEffect(() => { if (!options.enabled) cancel(); }, [options.enabled, cancel]);

  const select = useCallback(async (source: ImageCaptureSource, file?: File) => {
    const started = latest.current;
    if (!mounted.current || !started.enabled || operation.current || (!file && detectImageRuntime() === "web")) return;
    const controller = new AbortController();
    operation.current = controller;
    const current = () => mounted.current && operation.current === controller && !controller.signal.aborted
      && latest.current.enabled && latest.current.scopeKey === started.scopeKey;
    let candidate: NormalizedImage | null = null;
    const previousStatus = status.current;
    const reportStatus = (message: string) => { status.current = message; latest.current.onStatus(message); };
    setIsProcessing(true);
    reportStatus(started.copy.processing);
    try {
      candidate = await captureImage({ source, file, signal: controller.signal });
      if (!current()) return;
      reportStatus(latest.current.copy.validating);
      await validatePlantImageForUpload(candidate.dataUrl, latest.current.language, controller.signal);
      if (!current()) return;
      if (ownedImage.current) URL.revokeObjectURL(ownedImage.current.previewUrl);
      ownedImage.current = candidate;
      setImage(candidate);
      candidate = null; // Ownership transfers to the hook until replacement/clear/unmount.
      latest.current.onReady?.();
      reportStatus(latest.current.copy.ready);
    } catch (error) {
      if (!current()) return;
      if (isImageSelectionCancelled(error)) { reportStatus(previousStatus); return; }
      logImageProcessingFailure("selection", error);
      reportStatus(imageErrorMessage(error instanceof ImageUploadError ? error : new ImageUploadError("IMAGE_READ_FAILED"), latest.current.language)!);
    } finally {
      if (candidate) URL.revokeObjectURL(candidate.previewUrl);
      // An older result must never clear the spinner or lock of a newer operation.
      if (operation.current === controller) {
        operation.current = null;
        if (mounted.current) setIsProcessing(false);
      }
    }
  }, []);

  return { image, isProcessing, select, cancel, clear, isBusy: () => operation.current !== null };
};
