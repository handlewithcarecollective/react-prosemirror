import { EditorState } from "prosemirror-state";
import { doc, p } from "prosemirror-test-builder";

import { reactKeysPluginKey } from "../../plugins/reactKeys.js";
import { reorderSiblings } from "../reorderSiblings.js";

describe("reorderSiblings", () => {
  it("can swap two elements", () => {
    const state = EditorState.create({
      doc: doc(p("one"), p("two"), p("three"), p("four"), p("five")),
    });

    reorderSiblings(0, [0, 1, 3, 2, 4])(state, (tr) => {
      expect(tr.doc.textContent).toBe("onetwofourthreefive");
      expect(tr.getMeta(reactKeysPluginKey)).toEqual({
        overrides: { 0: 0, 5: 5, 10: 16, 17: 10, 23: 23 },
      });
    });
  });
  it("can shift two elements", () => {
    const state = EditorState.create({
      doc: doc(p("one"), p("two"), p("three"), p("four"), p("five")),
    });

    reorderSiblings(0, [0, 3, 1, 2, 4])(state, (tr) => {
      expect(tr.doc.textContent).toBe("onefourtwothreefive");
      expect(tr.getMeta(reactKeysPluginKey)).toEqual({
        overrides: { 0: 0, 5: 11, 10: 16, 17: 5, 23: 23 },
      });
    });
  });
});
