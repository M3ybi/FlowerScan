import { useEffect, useRef } from "react";

// A continuation belongs to one mounted screen and one identity/household epoch.
// Comparing only string keys would incorrectly accept an A -> B -> A transition.
export const useOperationScope = (key: string) => {
  const scope = useRef({ key, epoch: Symbol(), mounted: true });
  if (scope.current.key !== key) scope.current = { key, epoch: Symbol(), mounted: true };
  useEffect(() => {
    scope.current.mounted = true;
    return () => { scope.current.mounted = false; scope.current.epoch = Symbol(); };
  }, []);
  return () => {
    const epoch = scope.current.epoch;
    return () => scope.current.mounted && scope.current.epoch === epoch;
  };
};
