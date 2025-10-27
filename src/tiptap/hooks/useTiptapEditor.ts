import { useEditor } from "@tiptap/react";
import { EditorState } from "prosemirror-state";
import { DependencyList } from "react";

import { StaticEditorView } from "../../StaticEditorView.js";

export type UseTiptapEditorOptions = Omit<
  Parameters<typeof useEditor>[0],
  "element"
>;

export function useTiptapEditor(
  options: UseTiptapEditorOptions,
  deps?: DependencyList
) {
  const editor = useEditor({ ...options, element: null }, deps);

  // @ts-expect-error private property
  editor.editorView ??= new StaticEditorView({
    state: EditorState.create({ schema: editor.extensionManager.schema }),
    ...editor.options.editorProps,
    attributes: {
      role: "textbox",
      ...editor.extensionManager.attributes,
    },
  });

  return editor;
}
