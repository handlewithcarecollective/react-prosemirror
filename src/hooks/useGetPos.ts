import { useCallback } from "react";

import { useReactKeys } from "./useReactKeys.js";

export function useGetPos(reactKey: string | undefined) {
  if (reactKey === undefined) {
    throw new Error("useGetPos passed an undefined reactKey");
  }
  const reactKeys = useReactKeys();
  return useCallback(() => {
    const pos = reactKeys.keyToPos.get(reactKey);
    if (pos === undefined) {
      throw new Error(`Failed to find position for react key ${reactKey}`);
    }
    return pos;
  }, [reactKey, reactKeys]);
}
