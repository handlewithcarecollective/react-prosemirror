import { useLayoutEffect } from "react";

export function useClientLayoutEffect(
  ...args: Parameters<typeof useLayoutEffect>
) {
  if (typeof document === "undefined") return;

  // eslint-disable-next-line react-hooks/rules-of-hooks, react-hooks/exhaustive-deps
  useLayoutEffect(...args);
}
