type Options<T> = { signal?: AbortSignal; timeoutMs?: number | null; disposeLate?: (value: T) => void };
type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

// Cancellation settles the caller even when the underlying browser/SDK promise
// cannot be interrupted. Its late success/failure is still observed safely.
export const awaitAbortableOperation = <T>(
  start: () => Promise<T>,
  { signal, timeoutMs = 30_000, disposeLate }: Options<T> = {},
): Promise<T> => new Promise((resolve, reject) => {
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const finish = (outcome: Outcome<T>) => {
    if (settled) {
      if (outcome.ok && disposeLate) {
        try { disposeLate(outcome.value); }
        catch { console.warn("Late operation cleanup failed", { code: "LATE_OPERATION_CLEANUP_FAILED" }); }
      }
      return;
    }
    settled = true;
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    if (outcome.ok === true) resolve(outcome.value);
    else reject(outcome.error);
  };
  const abort = () => finish({ ok: false, error: signal?.reason ?? new DOMException("Operation cancelled", "AbortError") });
  if (signal?.aborted) { abort(); return; }
  signal?.addEventListener("abort", abort, { once: true });
  if (timeoutMs !== null) timer = setTimeout(() => finish({ ok: false, error: new DOMException("Operation timed out", "TimeoutError") }), timeoutMs);
  try { void start().then(value => finish({ ok: true, value }), error => finish({ ok: false, error })); }
  catch (error) { finish({ ok: false, error }); }
});
