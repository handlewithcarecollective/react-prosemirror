import { useEditor } from "@tiptap/react";
import { DependencyList } from "react";

export type UseTiptapEditorOptions = Omit<
  Parameters<typeof useEditor>[0],
  "element"
>;

export function useTiptapEditor(
  options: UseTiptapEditorOptions,
  deps?: DependencyList
) {
  return useEditor({ ...options, element: null }, deps);
}
