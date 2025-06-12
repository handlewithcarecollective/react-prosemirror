import { baseKeymap } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import { TextSelection } from "prosemirror-state";
import { br, doc, p, schema } from "prosemirror-test-builder";
import { EditorView } from "prosemirror-view";

import { beforeInputPlugin } from "../../plugins/beforeInputPlugin.js";
import { tempEditor } from "../../testing/editorViewTestHelpers.js";

describe("ProseMirror Mobile", () => {
  it("handles insertParagraph with mobile Enter key", async () => {
    const { view } = tempEditor({
      doc: doc(p("Hello")),
      plugins: createPlugins(),
    });

    setCursorAtEnd(view);
    view.focus();

    await browser.keys("Enter");
    expect(view.state.doc).toEqual(doc(p("Hello"), p()));
  });

  it("handles insertLineBreak with mobile Shift+Enter", async () => {
    const { view } = tempEditor({
      doc: doc(p("Hello")),
      plugins: createPlugins(),
    });

    setCursorAtEnd(view);
    view.focus();

    await browser.keys(["Shift", "Enter"]);
    expect(view.state.doc).toEqual(doc(p("Hello", br())));
  });
});

function createPlugins() {
  return [
    keymap({
      "Shift-Enter": (state, dispatch) => {
        const { tr } = state;
        if (schema.nodes.hard_break) {
          tr.insert(tr.selection.from, schema.nodes.hard_break.create());
          dispatch?.(tr);
          return true;
        }

        return false;
      },
    }),
    keymap(baseKeymap),
    beforeInputPlugin(() => {
      // no-op as this doesn't matter for this test
    }),
  ];
}

function setCursorAtEnd(view: EditorView) {
  const endPos = view.state.doc.content.size - 1;
  view.dispatch(
    view.state.tr.setSelection(
      TextSelection.near(view.state.doc.resolve(endPos))
    )
  );
}
