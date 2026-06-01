import { useContext } from "react";

import { EditorContext } from "../contexts/EditorContext.js";
import {
  ReactKeysPluginState,
  reactKeysPluginKey,
} from "../plugins/reactKeys.js";

export function useReactKeys(): ReactKeysPluginState | undefined {
  const { view } = useContext(EditorContext);
  return reactKeysPluginKey.getState(view.state);
}
