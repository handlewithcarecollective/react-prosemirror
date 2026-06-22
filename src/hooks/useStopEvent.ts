import { EditorView, NodeView } from "prosemirror-view";
import { useContext } from "react";

import { StopEventContext } from "../contexts/StopEventContext.js";

import { useEditorEffect } from "./useEditorEffect.js";
import { useEditorEventCallback } from "./useEditorEventCallback.js";

export function useStopEvent(
  stopEvent: (this: NodeView, view: EditorView, event: Event) => boolean
) {
  const register = useContext(StopEventContext);
  const stopEventMemo = useEditorEventCallback(stopEvent);
  useEditorEffect(() => {
    return register(stopEventMemo);
  }, [register, stopEventMemo]);
}
