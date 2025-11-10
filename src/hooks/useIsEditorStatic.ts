import { useContext } from "react";

import { EditorContext } from "../contexts/EditorContext.js";

export function useIsEditorStatic() {
  return useContext(EditorContext).isStatic;
}
