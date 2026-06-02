/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import "@wdio/types";
import { EditorState, Plugin, TextSelection } from "prosemirror-state";
import { code, doc, em, p, schema, strong } from "prosemirror-test-builder";
import {
  Decoration,
  DecorationSet,
  // @ts-expect-error This is an internal export
  __endComposition,
} from "prosemirror-view";
import React, { forwardRef } from "react";

import { widget } from "../../decorations/ReactWidgetType.js";
import { tempEditor } from "../../testing/editorViewTestHelpers.js";
import { WidgetViewComponentProps } from "../WidgetViewComponentProps.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace WebdriverIO {
    interface Browser {
      imeSetComposition(params: {
        text: string;
        selectionStart?: number;
        selectionEnd?: number;
        replacementStart?: number;
        replacementEnd?: number;
      }): Promise<void>;
      imeInsertText(params: { text: string }): Promise<void>;
    }
  }
}

function wordDeco(state: EditorState) {
  const re = /\w+/g,
    deco: Decoration[] = [];
  state.doc.descendants((node, pos) => {
    if (node.isText)
      for (let m; (m = re.exec(node.text!)); )
        deco.push(
          Decoration.inline(pos + m.index, pos + m.index + m[0].length, {
            class: "word",
          })
        );
  });
  return DecorationSet.create(state.doc, deco);
}

const wordHighlighter = new Plugin({
  props: { decorations: wordDeco },
});

const Widget = forwardRef<HTMLElement, WidgetViewComponentProps>(
  function Widget({ widget, getPos, ...props }, ref) {
    return (
      <var ref={ref} {...props}>
        ×
      </var>
    );
  }
);

function widgets(positions: number[], sides: number[]) {
  return new Plugin({
    state: {
      init(state) {
        const deco = positions.map((p, i) =>
          widget(p, Widget, { side: sides[i] })
        );
        return DecorationSet.create(state.doc!, deco);
      },
      apply(tr, deco) {
        return deco.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations(this: Plugin, state) {
        return this.getState(state);
      },
    },
  });
}

// These unfortunately aren't working at the moment, though
// composition seems to be working generally.
describe("EditorView composition", () => {
  it("supports composition in an empty block", async () => {
    const { view: pm } = tempEditor({ doc: doc(p("<a>")) });

    pm.focus();

    await browser.imeSetComposition({
      text: "a",
      selectionStart: 1,
      selectionEnd: 1,
    });
    await browser.imeSetComposition({
      text: "ab",
      selectionStart: 2,
      selectionEnd: 2,
    });
    await browser.imeSetComposition({
      text: "abc",
      selectionStart: 3,
      selectionEnd: 3,
    });
    await browser.imeInsertText({ text: "abc" });

    expect(pm.state.doc).toEqualNode(doc(p("abc")));
  });

  it("supports composition at end of block", async () => {
    const { view: pm } = tempEditor({ doc: doc(p("foo<a>")) });

    pm.focus();

    await browser.imeSetComposition({
      text: "!",
      selectionStart: 1,
      selectionEnd: 1,
    });

    await browser.imeSetComposition({
      text: "!?",
      selectionStart: 2,
      selectionEnd: 2,
    });

    await browser.imeInsertText({ text: "!?" });

    expect(pm.state.doc).toEqualNode(doc(p("foo!?")));
  });

  it("supports composition inside existing text", async () => {
    const { view: pm } = tempEditor({ doc: doc(p("f<a>oo")) });
    pm.focus();

    await browser.imeSetComposition({
      text: "x",
      selectionStart: 1,
      selectionEnd: 1,
    });

    await browser.imeSetComposition({
      text: "xy",
      selectionStart: 2,
      selectionEnd: 2,
    });

    await browser.imeSetComposition({
      text: "xyz",
      selectionStart: 3,
      selectionEnd: 3,
    });

    await browser.imeInsertText({ text: "xyz" });

    expect(pm.state.doc).toEqualNode(doc(p("fxyzoo")));
  });

  it("handles replacement of existing words", async () => {
    const startDoc = doc(p("one <a>two<b> three"));
    const { view: pm } = tempEditor({
      doc: startDoc,
      selection: TextSelection.between(
        startDoc.resolve(startDoc.tag!.a!),
        startDoc.resolve(startDoc.tag!.b!)
      ),
    });

    pm.focus();

    await browser.imeSetComposition({
      text: "five",
      selectionStart: 4,
      selectionEnd: 4,
    });

    await browser.imeSetComposition({
      text: "seven",
      selectionStart: 5,
      selectionEnd: 5,
    });

    await browser.imeSetComposition({
      text: "zero",
      selectionStart: 4,
      selectionEnd: 4,
    });

    await browser.imeInsertText({ text: "zero" });

    expect(pm.state.doc).toEqualNode(doc(p("one zero three")));
  });

  it("handles composition inside marks", async () => {
    const { view: pm } = tempEditor({ doc: doc(p("one ", em("two<a>"))) });

    pm.focus();

    await browser.imeSetComposition({
      text: "o",
      selectionStart: 1,
      selectionEnd: 1,
    });

    await browser.imeSetComposition({
      text: "oo",
      selectionStart: 2,
      selectionEnd: 2,
    });

    await browser.imeSetComposition({
      text: "oow",
      selectionStart: 3,
      selectionEnd: 3,
    });

    await browser.imeInsertText({ text: "oow" });

    expect(pm.state.doc).toEqualNode(doc(p("one ", em("twooow"))));
  });

  it("handles composition in a mark that has multiple children", async () => {
    const { view: pm } = tempEditor({
      doc: doc(p("one ", em("two<a>", strong(" three")))),
    });

    pm.focus();

    await browser.imeSetComposition({
      text: "o",
      selectionStart: 1,
      selectionEnd: 1,
    });

    await browser.imeSetComposition({
      text: "oo",
      selectionStart: 2,
      selectionEnd: 2,
    });

    await browser.imeSetComposition({
      text: "oow",
      selectionStart: 3,
      selectionEnd: 3,
    });

    await browser.imeInsertText({ text: "oow" });

    expect(pm.state.doc).toEqualNode(
      doc(p("one ", em("twooow", strong(" three"))))
    );
  });

  it("supports composition in a cursor wrapper", async () => {
    const { view: pm } = tempEditor({ doc: doc(p("<a>")) });

    pm.dispatch(pm.state.tr.addStoredMark(schema.marks.em!.create()));

    pm.focus();

    await browser.imeSetComposition({
      text: "a",
      selectionStart: 1,
      selectionEnd: 1,
    });

    await browser.imeSetComposition({
      text: "ab",
      selectionStart: 2,
      selectionEnd: 2,
    });

    await browser.imeSetComposition({
      text: "abc",
      selectionStart: 3,
      selectionEnd: 3,
    });

    await browser.imeInsertText({ text: "abc" });

    expect(pm.state.doc).toEqualNode(doc(p(em("abc"))));
  });

  it("handles composition in a multi-child mark with a cursor wrapper", async () => {
    const { view: pm } = tempEditor({
      doc: doc(p("one ", em("two<a>", strong(" three")))),
    });
    pm.dispatch(pm.state.tr.addStoredMark(schema.marks.code!.create()));

    pm.focus();

    await browser.imeSetComposition({
      text: "o",
      selectionStart: 1,
      selectionEnd: 1,
    });

    await browser.imeSetComposition({
      text: "oo",
      selectionStart: 2,
      selectionEnd: 2,
    });

    await browser.imeSetComposition({
      text: "oow",
      selectionStart: 3,
      selectionEnd: 3,
    });

    await browser.imeInsertText({ text: "oow" });

    expect(pm.state.doc).toEqualNode(
      doc(p("one ", em("two", code("oow"), strong(" three"))))
    );
  });

  it("doesn't get interrupted by changes in decorations", async () => {
    const startDoc = doc(p("foo ..."));
    const { view: pm } = tempEditor({
      doc: startDoc,
      selection: TextSelection.between(
        startDoc.resolve(5),
        startDoc.resolve(8)
      ),
      plugins: [wordHighlighter],
    });

    pm.focus();

    await browser.imeSetComposition({
      text: "h",
      selectionStart: 1,
      selectionEnd: 1,
    });

    await browser.imeSetComposition({
      text: "hi",
      selectionStart: 2,
      selectionEnd: 2,
    });

    await browser.imeInsertText({ text: "hi" });

    expect(pm.state.doc).toEqualNode(doc(p("foo hi")));
  });

  it("works inside highlighted text", async () => {
    const { view: pm } = tempEditor({
      doc: doc(p("one<a> two")),
      plugins: [wordHighlighter],
    });

    pm.focus();

    await browser.imeSetComposition({
      text: "x",
      selectionStart: 1,
      selectionEnd: 1,
    });
    await browser.imeSetComposition({
      text: "xy",
      selectionStart: 2,
      selectionEnd: 2,
    });
    await browser.imeSetComposition({
      text: "xy.",
      selectionStart: 3,
      selectionEnd: 3,
    });

    await browser.imeInsertText({
      text: "xy.",
    });

    expect(pm.state.doc).toEqualNode(doc(p("onexy. two")));
  });

  // TODO: Figure out how to properly represent this with wdio/Input.imeSetComposition
  // eslint-disable-next-line jest/no-disabled-tests
  it.skip("can handle compositions spanning multiple nodes", async () => {
    const { view: pm } = tempEditor({
      doc: doc(p("one two<a>")),
      plugins: [wordHighlighter],
    });

    pm.focus();

    await browser.imeSetComposition({
      text: "one twoa",
      selectionStart: 8,
      selectionEnd: 8,
      // Causes command to fail, probably incorrect
      // argument values?
      // replacementStart: -7,
      // replacementEnd: 0,
    });

    await browser.imeSetComposition({
      text: "one twoab",
      selectionStart: 9,
      selectionEnd: 9,
    });

    await browser.imeSetComposition({
      text: "one twoabc",
      selectionStart: 10,
      selectionEnd: 10,
    });

    await browser.imeSetComposition({
      text: "xone twoabc",
      selectionStart: 0,
      selectionEnd: 0,
    });

    await browser.imeSetComposition({
      text: "xyone twoabc",
      selectionStart: 0,
      selectionEnd: 0,
    });

    await browser.imeSetComposition({
      text: "xyzone twoabc",
      selectionStart: 0,
      selectionEnd: 0,
    });

    await browser.imeInsertText({
      text: "xyzone twoabc",
    });

    expect(pm.state.doc).toEqualNode(doc(p("xyzone twoabc")));
  });

  it("doesn't overwrite widgets next to the composition", async () => {
    const { view: pm } = tempEditor({
      doc: doc(p("<a>")),
      plugins: [widgets([1, 1], [-1, 1])],
    });

    pm.focus();

    await browser.imeSetComposition({
      text: "a",
      selectionStart: 1,
      selectionEnd: 1,
    });

    await browser.imeSetComposition({
      text: "ab",
      selectionStart: 2,
      selectionEnd: 2,
    });

    await browser.imeInsertText({
      text: "ab",
    });

    expect(pm.dom.querySelectorAll("var")).toHaveLength(2);
    expect(pm.state.doc).toEqualNode(doc(p("ab")));
  });

  it("cancels composition when a change fully overlaps with it", async () => {
    const { view: pm } = tempEditor({
      doc: doc(p("one"), p("two<a>"), p("three")),
    });

    pm.focus();

    await browser.imeSetComposition({
      text: "x",
      selectionStart: 1,
      selectionEnd: 1,
    });

    pm.dispatch(pm.state.tr.insertText("---", 3, 13));

    expect(pm.state.doc).toEqualNode(doc(p("on---hree")));
  });

  // it.skip("cancels composition when a change partially overlaps with it", async () => {
  //   const { view: pm } = tempEditor({
  //     doc: doc(p("one"), p("<a>two"), p("three")),
  //   });
  //   pm.focus();

  //   await browser.imeSetComposition({
  //     text: "x",
  //     selectionStart: 1,
  //     selectionEnd: 1,
  //   });

  //   pm.dispatch(pm.state.tr.insertText("---", 7, 15));

  //   expect(pm.state.doc).toEqualNode(doc(p("one"), p("x---ee")));
  // });

  // it.skip("cancels composition when a change happens inside of it", () => {
  //   const { view: pm } = requireFocus(
  //     tempEditor({ doc: doc(p("one"), p("two"), p("three")) })
  //   );
  //   compose(
  //     pm,
  //     () => edit(findTextNode(pm.dom, "two")!, "x", 0),
  //     [() => pm.dispatch(pm.state.tr.insertText("!", 7, 8))],
  //     { cancel: true }
  //   );
  //   ist(pm.state.doc, doc(p("one"), p("x!wo"), p("three")), eq);
  // });

  // it("doesn't cancel composition when a change happens elsewhere", async () => {
  //   const { view: pm } = tempEditor({
  //     doc: doc(p("one"), p("two"), p("three")),
  //   });

  //   pm.focus();

  //   await browser.imeSetComposition({
  //     text: "x",
  //     selectionStart: 1,
  //     selectionEnd: 1,
  //   });

  //   await browser.imeSetComposition({
  //     text: "xy",
  //     selectionStart: 2,
  //     selectionEnd: 2,
  //   });
  //   pm.dispatch(pm.state.tr.insertText("!", 2, 3));

  //   await browser.imeSetComposition({
  //     text: "xyz",
  //     selectionStart: 3,
  //     selectionEnd: 3,
  //   });

  //   expect(pm.state.doc).toEqualNode(doc(p("o!e"), p("xyztwo"), p("three")));
  // });

  // it("handles compositions rapidly following each other", () => {
  //   const { view: pm } = tempEditor({ doc: doc(p("one"), p("two")) });
  //   event(pm, "compositionstart");
  //   const one = findTextNode(pm.dom, "one")!;
  //   edit(one, "!");
  //   pm.domObserver.flush();
  //   event(pm, "compositionend");
  //   one.nodeValue = "one!!";
  //   const L2 = pm.dom.lastChild;
  //   event(pm, "compositionstart");
  //   const two = findTextNode(pm.dom, "two")!;
  //   ist(pm.dom.lastChild, L2);
  //   edit(two, ".");
  //   pm.domObserver.flush();
  //   ist(document.getSelection()!.focusNode, two);
  //   ist(document.getSelection()!.focusOffset, 4);
  //   ist(pm.composing);
  //   event(pm, "compositionend");
  //   pm.domObserver.flush();
  //   ist(pm.state.doc, doc(p("one!!"), p("two.")), eq);
  // });

  it("can handle cross-paragraph compositions", async () => {
    const startDoc = doc(p("one <a>two"), p("three"), p("four<b> five"));
    const { view: pm } = tempEditor({
      doc: startDoc,
      selection: TextSelection.between(
        startDoc.resolve(startDoc.tag!.a!),
        startDoc.resolve(startDoc.tag!.b!)
      ),
    });

    pm.focus();

    await browser.imeSetComposition({
      text: "A",
      selectionStart: 1,
      selectionEnd: 1,
    });

    await browser.imeSetComposition({
      text: "B",
      selectionStart: 1,
      selectionEnd: 1,
    });

    await browser.imeSetComposition({
      text: "C",
      selectionStart: 1,
      selectionEnd: 1,
    });

    await browser.imeInsertText({ text: "C" });

    expect(pm.state.doc).toEqualNode(doc(p("one C five")));
  });
});
