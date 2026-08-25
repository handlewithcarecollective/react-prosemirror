import { MutableRefObject, useCallback, useRef } from "react";

export function useSetDom(
  domRef: MutableRefObject<HTMLElement | null>,
  refUpdated: () => void,
  isMounted?: () => boolean,
  forceUpdate?: () => void
) {
  const pendingRef = useRef(false);

  return useCallback(
    (el: HTMLElement | null) => {
      if (el !== null) {
        pendingRef.current = false;

        const changed = domRef.current !== el;
        domRef.current = el;
        if (changed) forceUpdate?.();
        refUpdated();
        return;
      }

      if (pendingRef.current) return;
      pendingRef.current = true;

      // React calls old ref callbacks with
      // null before synchronously calling
      // new ref callbacks with the existing
      // element ref. We don't have any
      // way to distinguish a call with null
      // because the downstream callback is
      // unstable and being replaced during render
      // from a call with null because the referenced
      // element has been unmounted.
      //
      // Since the ref callback calls are synchronous,
      // we can queue a microtask and check
      // whether the ref is still null at
      // the end of this event loop task. If it
      // is, we actually unmounted. If it's not,
      // we already handled it in the synchronous
      // branch above, so we just bail.
      queueMicrotask(() => {
        if (!pendingRef.current) return;
        pendingRef.current = false;
        if (domRef.current !== null) {
          domRef.current = null;
          if (isMounted?.()) forceUpdate?.();
        }
        refUpdated();
      });
    },
    [domRef, forceUpdate, isMounted, refUpdated]
  );
}
