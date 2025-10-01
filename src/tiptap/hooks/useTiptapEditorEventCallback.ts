import { Editor } from "@tiptap/core";
import { useCurrentEditor } from "@tiptap/react";

import { useEditorEventCallback } from "../../hooks/useEditorEventCallback.js";

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
  const { editor } = useCurrentEditor();

  return useEditorEventCallback((_, ...args: T) => {
    assertEditor(editor);
    return callback(editor, ...args);
  });
}
