import { EditorView, NodeView, ViewMutationRecord } from "prosemirror-view";
import { useContext } from "react";

import { IgnoreMutationContext } from "../contexts/IgnoreMutationContext.js";

import { useEditorEffect } from "./useEditorEffect.js";
import { useEditorEventCallback } from "./useEditorEventCallback.js";

export function useIgnoreMutation(
  ignoreMutation: (
    this: NodeView,
    view: EditorView,
    mutation: ViewMutationRecord
  ) => boolean
) {
  const register = useContext(IgnoreMutationContext);
  const ignoreMutationMemo = useEditorEventCallback(ignoreMutation);
  useEditorEffect(() => {
    return register(ignoreMutationMemo);
  }, [register, ignoreMutationMemo]);
}
