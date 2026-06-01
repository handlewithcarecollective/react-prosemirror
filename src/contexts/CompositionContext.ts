import { createContext } from "react";

export interface CompositionContextValue {
  freezeFrom: number | null;
}

export const CompositionContext = createContext<CompositionContextValue>({
  freezeFrom: null,
});
