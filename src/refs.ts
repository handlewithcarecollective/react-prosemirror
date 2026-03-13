import { MutableRefObject, Ref, RefCallback, useCallback } from "react";

export function useMergedDOMRefs<Value>(
  ...refs: Ref<Value>[]
): RefCallback<Value> {
  return useCallback((value: Value) => {
    refs.forEach((ref) => {
      if (typeof ref === "function") {
        ref(value);
        return;
      }

      if (ref) {
        (ref as MutableRefObject<Value>).current = value;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, refs);
}
