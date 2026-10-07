import { useEffect, useMemo, useRef, useState } from "react";
import { listHouseholdSubscriptionHistoryPage } from "../lib/householdSubscriptionHistory.js";
import { createHouseholdSubscriptionHistoryController, emptyHouseholdHistoryState, householdHistoryScopeKey } from "../lib/householdSubscriptionHistoryController.js";
import type { HouseholdHistoryLookup, HouseholdHistoryScope } from "../lib/householdSubscriptionHistoryController.js";

export const useHouseholdSubscriptionHistory = (scope: HouseholdHistoryScope, lookup: HouseholdHistoryLookup = listHouseholdSubscriptionHistoryPage) => {
  const [state, setState] = useState(emptyHouseholdHistoryState);
  const controller = useMemo(() => createHouseholdSubscriptionHistoryController(lookup, setState), [lookup]);
  const key = householdHistoryScopeKey(scope);
  const latestKey = useRef(key);
  latestKey.current = key;
  const revision = scope.revision ?? "";
  useEffect(() => { controller.activate(); void controller.setScope(scope); }, [controller, scope.userId, scope.householdId, scope.enabled, revision]);
  useEffect(() => () => controller.dispose(), [controller]);
  const current = state.scopeKey === key ? state : { ...emptyHouseholdHistoryState(), scopeKey: key, loading: Boolean(key) };
  return {
    items: current.items, loading: current.loading || (Boolean(key) && state.revision !== revision), error: current.error && state.revision === revision,
    hasMore: current.hasMore, loadingMore: current.loadingMore, loadMoreError: current.loadMoreError,
    refresh: () => latestKey.current === key ? controller.refresh() : Promise.resolve(),
    loadMore: () => latestKey.current === key ? controller.loadMore() : Promise.resolve(),
  };
};
