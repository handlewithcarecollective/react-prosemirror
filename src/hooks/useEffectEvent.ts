import { useCallback, useLayoutEffect, useRef } from "react";

export default function useEffectEvent<P extends unknown[], R>(
  fn: (...args: P) => R
): (...funcArgs: P) => R {
  const ref = useRef(fn);

  // Ideally this would be a useInsertionEffect, but
  // that was introduced in React 18 and we still
  // support React 17. useLayoutEffect is safe
  // here as long as the function returned by
  // useEffectEvent isn't called in a layout effect
  // that's defined _before_ the useEffectEvent
  // call.
  useLayoutEffect(() => {
    ref.current = fn;
  }, [fn]);

  return useCallback((...args: P): R => {
    const f = ref.current;
    return f(...args);
  }, []);
}
