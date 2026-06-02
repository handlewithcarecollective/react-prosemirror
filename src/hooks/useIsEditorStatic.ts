import { useContext } from "react";

import { EditorContext } from "../contexts/EditorContext.js";

/**
 * Returns true if the nearest ProseMirror component
 * is rendered with the `static` prop set to `true`.
 */
export function useIsEditorStatic() {
  return useContext(EditorContext)?.isStatic ?? false;
}
