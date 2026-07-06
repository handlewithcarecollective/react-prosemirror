import { DependencyList } from "react";

import { ReactProseMirror } from "../extensions/ReactProseMirror.js";
import { ReactProseMirrorCommands } from "../extensions/ReactProseMirrorCommands.js";

import { useEditor } from "./useEditor.js";

export type UseTiptapEditorOptions = Omit<
  Parameters<typeof useEditor>[0],
  "element"
>;

/**
 * Create a React ProseMirror integrated Tiptap Editor instance.
 * @param options The editor options
 * @param deps The dependencies to watch for changes
 * @returns The editor instance
 * @example const editor = useEditor({ extensions: [...] })
 */
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

  return useEditor(
    {
      ...options,
      extensions,
      element: null,
    },
    deps
  );
}
