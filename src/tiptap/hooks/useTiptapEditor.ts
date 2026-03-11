import { useEditor } from "@tiptap/react";
import { DependencyList } from "react";

import { StaticEditorView } from "../../StaticEditorView.js";
import { ReactProseMirror } from "../extensions/ReactProseMirror.js";
import { ReactProseMirrorCommands } from "../extensions/ReactProseMirrorCommands.js";

export type UseTiptapEditorOptions = Omit<
  Parameters<typeof useEditor>[0],
  "element"
>;

export function useTiptapEditor(
  options: UseTiptapEditorOptions,
  deps?: DependencyList
) {
  const extensions = [ReactProseMirror, ...(options.extensions ?? [])];
  // If a consumer explicitly disables core extensions (or the Commands core extension)
  // do not re-add our custom Commands
  if (
    options.enableCoreExtensions === false ||
    (typeof options.enableCoreExtensions === "object" &&
      options?.enableCoreExtensions?.commands === false)
  ) {
    // Do nothing
  } else {
    options.enableCoreExtensions = {
      ...(typeof options.enableCoreExtensions === "object"
        ? options.enableCoreExtensions
        : {}),
      commands: false,
    };
    extensions.push(ReactProseMirrorCommands);
  }

  const editor = useEditor(
    {
      ...options,
      extensions,
      element: null,
    },
    deps
  );

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
  const stateNeedsReconfigure = !stateHasPlugins && !editor.isDestroyed;

  if (stateNeedsReconfigure) {
    const managerPlugins = editor.extensionManager.plugins;
    if (managerPlugins.length) {
      // @ts-expect-error private property
      editor.editorState = editor.editorState.reconfigure({
        plugins: editor.extensionManager.plugins,
      });
      // @ts-expect-error private property
      editor.editorView.updateState(editor.editorState);
    }
  }

  return editor;
}
