// Browser decoders/encoders do not consistently observe AbortSignal. Release the
// caller immediately, and dispose results which arrive after cancellation.
export const awaitImageOperation = <T>(
  start: () => Promise<T>,
  signal?: AbortSignal,
  disposeLate?: (value: T) => void,
  timeoutMs = 30_000,
): Promise<T> => new Promise((resolve, reject) => {
  let settled = false;
  const finish = (error?: unknown, value?: T) => {
    if (settled) { if (!error && value !== undefined) disposeLate?.(value); return; }
    settled = true;
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    if (error) reject(error); else resolve(value!);
  };
  const abort = () => finish(new DOMException("Image operation cancelled", "AbortError"));
  const timer = setTimeout(() => finish(new DOMException("Image operation timed out", "TimeoutError")), timeoutMs);
  if (signal?.aborted) { abort(); return; }
  signal?.addEventListener("abort", abort, { once: true });
  try { void start().then(value => finish(undefined, value), error => finish(error)); }
  catch (error) { finish(error); }
});
