import { useContext, useState } from "react";

import { GetPosContext } from "../components/nodes/NodeView.js";
import { useEditorEventListener } from "../index.js";

/**
 * Returns true while an IME composition is active inside the current node.
 */
export function useIsComposingIn(): boolean {
  const [isComposing, setIsComposing] = useState(false);
  const getPos = useContext(GetPosContext);
  useEditorEventListener("compositionstart", (view) => {
    const compositionRoot = view.state.selection.$from.before();
    setIsComposing(compositionRoot === getPos());
  });

  useEditorEventListener("compositionend", () => {
    setIsComposing(false);
  });

  return isComposing;
}
