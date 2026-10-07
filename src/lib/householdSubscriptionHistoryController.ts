import type { HouseholdSubscriptionHistoryCursor, HouseholdSubscriptionHistoryPage } from "./householdSubscriptionHistory.js";
import { normalizeSubscriptionHistory } from "./subscriptionHistoryModel.js";
import type { RawSubscriptionHistoryEvent, SubscriptionHistoryItem } from "./subscriptionHistoryModel.js";

export type HouseholdHistoryScope = { userId: string | null; householdId: string | null; enabled?: boolean; revision?: string };
export type HouseholdHistoryState = { scopeKey: string; revision: string; items: SubscriptionHistoryItem[]; loading: boolean; error: boolean; hasMore: boolean; loadingMore: boolean; loadMoreError: boolean };
export type HouseholdHistoryLookup = (householdId: string, cursor?: HouseholdSubscriptionHistoryCursor | null) => Promise<HouseholdSubscriptionHistoryPage>;
export const householdHistoryScopeKey = ({ userId, householdId, enabled = true }: HouseholdHistoryScope) =>
  enabled && userId && householdId ? JSON.stringify([userId, householdId]) : "";
export const emptyHouseholdHistoryState = (): HouseholdHistoryState => ({ scopeKey: "", revision: "", items: [], loading: false, error: false, hasMore: false, loadingMore: false, loadMoreError: false });

export const createHouseholdSubscriptionHistoryController = (lookup: HouseholdHistoryLookup, onChange: (state: HouseholdHistoryState) => void) => {
  let scope: HouseholdHistoryScope = { userId: null, householdId: null };
  let state = emptyHouseholdHistoryState();
  let generation = 0;
  let disposed = false;
  let events: RawSubscriptionHistoryEvent[] = [];
  let cursor: HouseholdSubscriptionHistoryCursor | null = null;
  let pendingInitial: Promise<void> | null = null;
  let pendingMore: Promise<void> | null = null;
  const emit = (next: HouseholdHistoryState) => { state = next; if (!disposed) onChange(state); };
  const refresh = (): Promise<void> => {
    if (disposed || !state.scopeKey || !scope.householdId) return Promise.resolve();
    const requestGeneration = ++generation;
    const requestScope = state.scopeKey;
    const householdId = scope.householdId;
    pendingMore = null;
    emit({ ...state, loading: true, error: false, loadingMore: false, loadMoreError: false });
    const request = Promise.resolve().then(() => lookup(householdId, null)).then((page) => {
      if (disposed || generation !== requestGeneration || state.scopeKey !== requestScope) return;
      events = page.events;
      cursor = page.nextCursor;
      emit({ ...state, items: normalizeSubscriptionHistory(events, householdId), loading: false, error: false, hasMore: page.hasMore });
    }).catch(() => {
      if (disposed || generation !== requestGeneration || state.scopeKey !== requestScope) return;
      emit({ ...state, loading: false, error: true });
    }).finally(() => { if (pendingInitial === request) pendingInitial = null; });
    pendingInitial = request;
    return request;
  };
  const loadMore = (): Promise<void> => {
    if (pendingMore) return pendingMore;
    if (disposed || state.loading || state.error || !state.hasMore || !scope.householdId || !cursor) return Promise.resolve();
    const requestGeneration = generation;
    const requestScope = state.scopeKey;
    const householdId = scope.householdId;
    const requestCursor = cursor;
    emit({ ...state, loadingMore: true, loadMoreError: false });
    const request = Promise.resolve().then(() => lookup(householdId, requestCursor)).then((page) => {
      if (disposed || generation !== requestGeneration || state.scopeKey !== requestScope) return;
      events = [...events, ...page.events];
      cursor = page.nextCursor;
      emit({ ...state, items: normalizeSubscriptionHistory(events, householdId), loadingMore: false, loadMoreError: false, hasMore: page.hasMore });
    }).catch(() => {
      if (disposed || generation !== requestGeneration || state.scopeKey !== requestScope) return;
      emit({ ...state, loadingMore: false, loadMoreError: true });
    }).finally(() => { if (pendingMore === request) pendingMore = null; });
    pendingMore = request;
    return request;
  };
  return {
    getState: () => state,
    setScope(next: HouseholdHistoryScope) {
      if (disposed) return Promise.resolve();
      const key = householdHistoryScopeKey(next);
      const revision = next.revision ?? "";
      if (key === state.scopeKey && revision === state.revision) return pendingInitial ?? Promise.resolve();
      generation += 1;
      pendingInitial = null;
      pendingMore = null;
      const changedHousehold = key !== state.scopeKey;
      scope = next;
      if (changedHousehold) { events = []; cursor = null; }
      emit({ ...(changedHousehold ? emptyHouseholdHistoryState() : state), scopeKey: key, revision, loading: Boolean(key), error: false, loadingMore: false, loadMoreError: false });
      return key ? refresh() : Promise.resolve();
    },
    refresh,
    loadMore,
    activate() {
      if (!disposed) return;
      disposed = false;
      state = emptyHouseholdHistoryState();
      scope = { userId: null, householdId: null };
    },
    dispose() { disposed = true; generation += 1; pendingInitial = null; pendingMore = null; events = []; cursor = null; },
  };
};
