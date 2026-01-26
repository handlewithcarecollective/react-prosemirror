import { useEditor } from "@tiptap/react";
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
    // @ts-expect-error private property
    state: editor.editorState,
    ...editor.options.editorProps,
    attributes: {
      role: "textbox",
      ...editor.options.editorProps.attributes,
    },
  });

  // @ts-expect-error private property
  const stateHasPlugins = !!editor.editorState.plugins.length;
  const managerHasPlugins = !!editor.extensionManager.plugins.length;

  const stateNeedsReconfigure =
    !stateHasPlugins && managerHasPlugins && !editor.isDestroyed;

  // @ts-expect-error private property
  editor.editorState = stateNeedsReconfigure
    ? // @ts-expect-error private property
      editor.editorState.reconfigure({
        plugins: editor.extensionManager.plugins,
      })
    : // @ts-expect-error private property
      editor.editorState;

  if (stateNeedsReconfigure) {
    // @ts-expect-error private property
    editor.editorView.updateState(editor.editorState);
  }

  return editor;
}
