import { useContext } from "react";

import { NodeViewContext } from "../../contexts/NodeViewContext.js";

export function useIsInReactProseMirror() {
  return useContext(NodeViewContext) !== null;
}
