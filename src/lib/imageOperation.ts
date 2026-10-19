import { awaitAbortableOperation } from "./abortableOperation.js";

// Keep the image API stable; browser decoders also need late bitmap disposal.
export const awaitImageOperation = <T>(
  start: () => Promise<T>,
  signal?: AbortSignal,
  disposeLate?: (value: T) => void,
  timeoutMs = 30_000,
): Promise<T> => awaitAbortableOperation(start, { signal, disposeLate, timeoutMs });
