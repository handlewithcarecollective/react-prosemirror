import { useContext, useState } from "react";

// import { GetPosContext } from "../components/nodes/NodeView.js";
import { GetPosContext } from "../components/nodes/NodeView.js";
import { CompositionContext } from "../contexts/CompositionContext.js";
import { useEditorEventListener } from "../index.js";

/**
 * Returns true while an IME composition is active anywhere in the editor.
 *
 * Every component that calls this hook will rerender at the start and end
 * of a composition. Use `useIsComposingIn` if you need to check for an
 * active composition inside a NodeView.
 */
export function useIsComposing(): boolean {
  const { freezeFrom } = useContext(CompositionContext);
  return freezeFrom != null;
}

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
