import { useContext } from "react";

import { EditorContext } from "../../contexts/EditorContext.js";

export function useIsInReactProseMirror() {
  return useContext(EditorContext) !== null;
}
