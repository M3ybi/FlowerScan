// Non-authentication preferences and legacy records must remain usable when a
// browser denies storage or reaches its quota. Never persist over an unread key.
export const createResilientStorage = (resolve: () => Storage) => {
  const pending = new Map<string, string | null>();
  const unread = new Set<string>();
  const failures = new Set<string>();
  const listeners = new Set<() => void>();
  const update = (key: string, failed: boolean) => {
    const before = failures.size;
    if (failed) failures.add(key); else failures.delete(key);
    if (before !== failures.size) listeners.forEach(listener => listener());
  };
  const storage = {
    getItem(key: string): string | null {
      if (pending.has(key)) return pending.get(key)!;
      try { return resolve().getItem(key); }
      catch { unread.add(key); update(key, true); return null; }
    },
    setItem(key: string, value: string) {
      pending.set(key, value);
      try {
        if (unread.has(key)) { update(key, true); return; }
        resolve().setItem(key, value);
        pending.delete(key);
        update(key, false);
      } catch { update(key, true); }
    },
    removeItem(key: string) {
      pending.set(key, null);
      try {
        resolve().removeItem(key);
        pending.delete(key);
        unread.delete(key);
        update(key, false);
      } catch { update(key, true); }
    },
  };
  return {
    storage,
    hasFailure: () => failures.size > 0,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
};

export const browserPersistence = createResilientStorage(() => window.localStorage);
export const browserStorage = browserPersistence.storage;
