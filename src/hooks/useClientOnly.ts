import { useSyncExternalStore } from "react";

// eslint-disable-next-line @typescript-eslint/no-empty-function
function unsubscribe() {}

function subscribe() {
  return unsubscribe;
}

export function useClientOnly() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
