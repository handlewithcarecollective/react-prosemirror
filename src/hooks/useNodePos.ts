import { useContext } from "react";

import { GetPosContext } from "../components/nodes/NodeView.js";

import { useEditorState } from "./useEditorState.js";

/**
 * Get this node's current position in the document.
 *
 * Using this hook will subscribe this node to the
 * EditorState, which means that it will be re-rendered
 * on every EditorState update. This may have performance
 * implications for large documents.
 */
export function useNodePos() {
  useEditorState();
  const getPos = useContext(GetPosContext);
  return getPos();
}
