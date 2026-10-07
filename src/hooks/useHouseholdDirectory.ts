import { useCallback, useEffect, useRef, useState } from "react";
import { getUserHouseholds } from "../lib/plantieRepository";
import type { Household } from "../lib/plantieRepository";

type DirectoryState = { userId: string | null; households: Household[]; loading: boolean; error: boolean };

export const useHouseholdDirectory = (userId: string | null) => {
  const [state, setState] = useState<DirectoryState>({ userId: null, households: [], loading: false, error: false });
  const identityRef = useRef(userId);
  identityRef.current = userId;
  const generationRef = useRef(0);
  const pendingRef = useRef<Promise<Household[] | null> | null>(null);

  const refresh = useCallback((force = false): Promise<Household[] | null> => {
    if (!userId) return Promise.resolve([]);
    if (pendingRef.current && !force) return pendingRef.current;
    if (force) generationRef.current += 1;
    const generation = generationRef.current;
    setState((current) => ({ userId, households: current.userId === userId ? current.households : [], loading: true, error: false }));
    const request = getUserHouseholds().then((households) => {
      if (identityRef.current !== userId || generationRef.current !== generation) return null;
      setState({ userId, households, loading: false, error: false });
      return households;
    }).catch(() => {
      if (identityRef.current === userId && generationRef.current === generation) {
        setState((current) => ({ userId, households: current.userId === userId ? current.households : [], loading: false, error: true }));
      }
      return null;
    }).finally(() => {
      if (pendingRef.current === request) pendingRef.current = null;
    });
    pendingRef.current = request;
    return request;
  }, [userId]);

  useEffect(() => {
    generationRef.current += 1;
    pendingRef.current = null;
    setState({ userId, households: [], loading: Boolean(userId), error: false });
    if (userId) void refresh();
    return () => { generationRef.current += 1; pendingRef.current = null; };
  }, [userId, refresh]);

  useEffect(() => {
    if (!userId) return;
    const onReturn = () => { if (document.visibilityState !== "hidden") void refresh(); };
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [userId, refresh]);

  return { ...(state.userId === userId ? state : { userId, households: [], loading: Boolean(userId), error: false }), refresh };
};
