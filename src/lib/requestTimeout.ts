// AbortSignal.timeout is unavailable in some mobile browsers. Keep cancellation
// and release the timer as soon as the operation finishes on every runtime.
export const withRequestTimeout = async <T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<T> => {
  const controller = new AbortController();
  const abort = () => controller.abort(parentSignal?.reason ?? new DOMException("Request cancelled", "AbortError"));
  if (parentSignal?.aborted) abort();
  else parentSignal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs);
  try {
    if (controller.signal.aborted) throw controller.signal.reason;
    const result = await operation(controller.signal);
    if (controller.signal.aborted) throw controller.signal.reason;
    return result;
  } catch (error) {
    throw controller.signal.aborted ? controller.signal.reason : error;
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abort);
  }
};
