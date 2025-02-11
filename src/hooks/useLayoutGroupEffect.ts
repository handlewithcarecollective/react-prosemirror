/* Copyright (c) The New York Times Company */
import { useContext } from "react";
import type { DependencyList, EffectCallback } from "react";

import { LayoutGroupContext } from "../contexts/LayoutGroupContext.js";

import { useClientLayoutEffect } from "./useClientLayoutEffect.js";

/** Registers a layout effect to run at the nearest `LayoutGroup` boundary. */
export function useLayoutGroupEffect(
  effect: EffectCallback,
  deps?: DependencyList
) {
  const register = useContext(LayoutGroupContext);
  // The rule for hooks wants to statically verify the deps,
  // but the dependencies are up to the caller, not this implementation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useClientLayoutEffect(() => register(effect), deps);
}
