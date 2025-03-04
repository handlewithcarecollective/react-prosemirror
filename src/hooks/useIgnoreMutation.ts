import { EditorView, ViewMutationRecord } from "prosemirror-view";
import { useContext } from "react";

import { IgnoreMutationContext } from "../contexts/IgnoreMutationContext.js";

import { useEditorEffect } from "./useEditorEffect.js";
import { useEditorEventCallback } from "./useEditorEventCallback.js";

export function useIgnoreMutation(
  ignoreMutation: (view: EditorView, mutation: ViewMutationRecord) => boolean
) {
  const register = useContext(IgnoreMutationContext);
  const ignoreMutationMemo = useEditorEventCallback(ignoreMutation);
  useEditorEffect(() => {
    register(ignoreMutationMemo);
  }, [register, ignoreMutationMemo]);
}
