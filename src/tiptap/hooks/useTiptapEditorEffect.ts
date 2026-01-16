import { Editor } from "@tiptap/core";
import { useCurrentEditor } from "@tiptap/react";
import { DependencyList, useContext } from "react";

import { ReactEditorView } from "../../ReactEditorView.js";
import { EditorContext } from "../../contexts/EditorContext.js";
import { useEditorEffect } from "../../hooks/useEditorEffect.js";
import { TiptapEditorContext } from "../contexts/TiptapEditorContext.js";

/**
 * Registers a layout effect to run after the EditorView has
 * been updated with the latest EditorState and Decorations.
 *
 * Effects can take a Tiptap Editor instance as an argument.
 * This hook should be used to execute layout effects that
 * depend on the Editor, such as for positioning DOM
 * nodes based on ProseMirror positions.
 *
 * Layout effects registered with this hook still fire
 * synchronously after all DOM mutations, but they do so
 * _after_ the Editor has been updated, even when the
 * Editor lives in an ancestor component.
 *
 * This hook can only be used in a component that is mounted
 * as a child of the TiptapEditorView component, including
 * React node view components.
 */
export function useTiptapEditorEffect(
  effect: (editor: Editor) => void | (() => void),
  dependencies?: DependencyList
) {
  const { view } = useContext(EditorContext);
  const { editor } = useCurrentEditor();
  const { isEditorInitialized } = useContext(TiptapEditorContext);

  useEditorEffect(() => {
    if (
      editor?.view instanceof ReactEditorView &&
      view instanceof ReactEditorView &&
      isEditorInitialized
    ) {
      return effect(editor);
    }
    // The rules of hooks want to be able to statically
    // verify the dependencies for the effect, but this will
    // have already happened at the call-site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies && [editor, view, isEditorInitialized, ...dependencies]);
}
