import { useContext } from "react";

import { EditorContext } from "../contexts/EditorContext.js";
import { reactKeysPluginKey } from "../plugins/reactKeys.js";

export function useReactKeys() {
  const { view } = useContext(EditorContext);
  const reactKeys = reactKeysPluginKey.getState(view.state);
  if (!reactKeys) throw new Error("EditorState is missing reactKeys plugin");
  return reactKeys;
}
