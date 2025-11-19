import { Editor, type EditorOptions } from "@tiptap/core";
import { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import { StaticEditorView } from "../StaticEditorView.js";

export class TiptapEditor extends Editor {
  constructor(options: Partial<EditorOptions> = {}) {
    super({ ...options, element: null } as Partial<EditorOptions>);
  }

  get view(): EditorView {
    return (
      // @ts-expect-error private property
      this.editorView ??
      new StaticEditorView({
        state: EditorState.create({ schema: this.extensionManager.schema }),
        ...this.options.editorProps,
        attributes: {
          role: "textbox",
          ...this.extensionManager.attributes,
        },
      })
    );
  }
}
