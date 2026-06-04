import { useContext } from "react";

import { CompositionContext } from "../contexts/CompositionContext.js";

/**
 * Returns true while an IME composition is active in the editor.
 */
export function useIsComposing(): boolean {
  const { freezeFrom } = useContext(CompositionContext);
  return freezeFrom != null;
}
