import { Editor } from "@tiptap/core";
import { useCurrentEditor } from "@tiptap/react";
import { useCallback, useRef } from "react";

import { useEditorEffect } from "../../hooks/useEditorEffect.js";

function assertEditor(editor: Editor | null): asserts editor is Editor {
  if (editor) return;

  throw new DOMException(
    "Tiptap Editor is not initialized",
    "InvalidStateError"
  );
}

/**
 * Returns a stable function reference to be used as an
 * event handler callback.
 *
 * The callback will be called with the Tiptap Editor instance
 * as its first argument.
 *
 * This hook can only be used in a component that is mounted
 * as a child of the TiptapEditorView component, including
 * React node view components.
 */
export function useTiptapEditorEventCallback<T extends unknown[], R>(
  callback: (editor: Editor, ...args: T) => R
) {
  const ref = useRef(callback);
  const { editor } = useCurrentEditor();

  useEditorEffect(() => {
    ref.current = callback;
  }, [callback]);

  return useCallback(
    (...args: T) => {
      assertEditor(editor);
      return ref.current(editor, ...args);
    },
    [editor]
  );
}
