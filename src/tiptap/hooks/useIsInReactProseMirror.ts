import { useContext } from "react";

import { EditorContext } from "../../contexts/EditorContext.js";

/**
 * Returns true if the hook is called in a
 * component that's a descendant of the
 * ProseMirror component
 */
export function useIsInReactProseMirror() {
  return useContext(EditorContext) !== null;
}
