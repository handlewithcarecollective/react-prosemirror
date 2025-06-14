/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { screen } from "@testing-library/react";
import { Plugin } from "prosemirror-state";
import { blockquote, br, doc, p } from "prosemirror-test-builder";
import {
  Decoration,
  DecorationSet,
  ViewMutationRecord,
} from "prosemirror-view";
import React, { forwardRef, useEffect } from "react";

import { useEditorState } from "../../hooks/useEditorState.js";
import { useStopEvent } from "../../hooks/useStopEvent.js";
import { tempEditor } from "../../testing/editorViewTestHelpers.js";
import { NodeViewComponentProps } from "../NodeViewComponentProps.js";

describe("nodeViews prop", () => {
  it("can replace a node's representation", async () => {
    const { view } = tempEditor({
      doc: doc(p("foo", br())),
      nodeViews: {
        hard_break: forwardRef<HTMLElement, NodeViewComponentProps>(
          function Var(props, ref) {
            return <var ref={ref}>{props.children}</var>;
          }
        ),
      },
    });
    expect(view.dom.querySelector("var")).not.toBeNull();
  });

  it("can override drawing of a node's content", async () => {
    const { view } = tempEditor({
      doc: doc(p("foo")),
      nodeViews: {
        paragraph: forwardRef<HTMLParagraphElement, NodeViewComponentProps>(
          function Paragraph(props, ref) {
            return (
              <p ref={ref}>{props.nodeProps.node.textContent.toUpperCase()}</p>
            );
          }
        ),
      },
    });
    expect(view.dom.querySelector("p")!.textContent).toBe("FOO");
    view.dispatch(view.state.tr.insertText("a"));
    expect(view.dom.querySelector("p")!.textContent).toBe("AFOO");
  });

  // React makes this more or less trivial; the render
  // method of the component _is_ the update (and create)
  // method
  // eslint-disable-next-line jest/no-disabled-tests
  it.skip("can register its own update method", async () => {
    const { view } = tempEditor({
      doc: doc(p("foo")),
      nodeViews: {
        paragraph: forwardRef<HTMLParagraphElement, NodeViewComponentProps>(
          function Paragraph(props, ref) {
            return (
              <p ref={ref}>{props.nodeProps.node.textContent.toUpperCase()}</p>
            );
          }
        ),
      },
    });
    const para = view.dom.querySelector("p")!;
    view.dispatch(view.state.tr.insertText("a"));
    expect(view.dom.querySelector("p")).toBe(para);
    expect(para.textContent).toBe("AFOO");
  });

  it("allows decoration updates for node views with an update method", async () => {
    const { view, rerender } = tempEditor({
      doc: doc(p("foo")),
      nodeViews: {
        paragraph: forwardRef<HTMLParagraphElement, NodeViewComponentProps>(
          function Paragraph({ children, nodeProps, ...props }, ref) {
            return (
              <p {...props} ref={ref}>
                {children}
              </p>
            );
          }
        ),
      },
    });

    rerender({
      decorations(state) {
        return DecorationSet.create(state.doc, [
          Decoration.inline(2, 3, { someattr: "ok" }),
          Decoration.node(0, 5, { otherattr: "ok" }),
        ]);
      },
    });

    expect(view.dom.querySelector("[someattr]")).not.toBeNull();
    expect(view.dom.querySelector("[otherattr]")).not.toBeNull();
  });

  it("can provide a contentDOM property", async () => {
    const { view } = tempEditor({
      doc: doc(p("foo")),
      nodeViews: {
        paragraph: forwardRef<HTMLParagraphElement, NodeViewComponentProps>(
          function Paragraph(props, ref) {
            return (
              // ContentDOM is inferred from where props.children is rendered
              <p ref={ref}>{props.children}</p>
            );
          }
        ),
      },
    });
    const para = view.dom.querySelector("p")!;
    view.dispatch(view.state.tr.insertText("a"));
    expect(view.dom.querySelector("p")).toBe(para);
    expect(para.textContent).toBe("afoo");
  });

  it("has its destroy method called", async () => {
    let destroyed = 0;
    const { view } = tempEditor({
      doc: doc(p("foo", br())),
      nodeViews: {
        hard_break: forwardRef<HTMLBRElement, NodeViewComponentProps>(
          function BR(_props, ref) {
            // React implements "destroy methods" with effect
            // hooks
            useEffect(() => {
              return () => {
                destroyed++;
              };
            }, []);
            return <br ref={ref} />;
          }
        ),
      },
    });
    // TODO: This gets destroyed once essentially
    // immediately, due to the dummy EditorView that
    // we create and then immediately destroy for SSR
    expect(destroyed).toBe(1);
    view.dispatch(view.state.tr.delete(3, 5));
    expect(destroyed).toBe(2);
  });

  it("can query its own position", async () => {
    let pos: number | undefined;
    const { view } = tempEditor({
      doc: doc(blockquote(p("abc"), p("foo", br()))),
      nodeViews: {
        hard_break: forwardRef<HTMLBRElement, NodeViewComponentProps>(
          function BR({ nodeProps, children, ...props }, ref) {
            // trigger a re-render on every update, otherwise we won't
            // re-render when an updated doesn't directly affect us
            useEditorState();
            pos = nodeProps.getPos();
            return <br {...props} ref={ref} />;
          }
        ),
      },
    });
    expect(pos).toBe(10);
    view.dispatch(view.state.tr.insertText("a"));
    expect(pos).toBe(11);
  });

  it("has access to outer decorations", async () => {
    const plugin = new Plugin({
      state: {
        init() {
          return null;
        },
        apply(tr, prev) {
          return tr.getMeta("setDeco") || prev;
        },
      },
      props: {
        decorations(this: Plugin, state) {
          const deco = this.getState(state);
          return (
            deco &&
            DecorationSet.create(state.doc, [
              Decoration.inline(0, state.doc.content.size, {}, {
                name: deco,
              } as any),
            ])
          );
        },
      },
    });
    const { view } = tempEditor({
      doc: doc(p("foo", br())),
      plugins: [plugin],
      nodeViews: {
        hard_break: forwardRef<HTMLElement, NodeViewComponentProps>(
          function Var(props, ref) {
            return (
              <var ref={ref}>
                {props.nodeProps.decorations.length
                  ? props.nodeProps.decorations[0]!.spec.name
                  : "[]"}
              </var>
            );
          }
        ),
      },
    });
    expect(view.dom.querySelector("var")!.textContent).toBe("[]");
    view.dispatch(view.state.tr.setMeta("setDeco", "foo"));
    expect(view.dom.querySelector("var")!.textContent).toBe("foo");
    view.dispatch(view.state.tr.setMeta("setDeco", "bar"));
    expect(view.dom.querySelector("var")!.textContent).toBe("bar");
  });

  it("provides access to inner decorations in the constructor", async () => {
    tempEditor({
      doc: doc(p("foo")),
      nodeViews: {
        paragraph: forwardRef<HTMLParagraphElement, NodeViewComponentProps>(
          function Paragraph(props, ref) {
            expect(
              (props.nodeProps.innerDecorations as DecorationSet)
                .find()
                .map((d) => `${d.from}-${d.to}`)
                .join()
            ).toBe("1-2");
            return <p ref={ref}>{props.children}</p>;
          }
        ),
      },
      decorations(state) {
        return DecorationSet.create(state.doc, [
          Decoration.inline(2, 3, { someattr: "ok" }),
          Decoration.node(0, 5, { otherattr: "ok" }),
        ]);
      },
    });
  });

  it("provides access to inner decorations in the update method", async () => {
    let innerDecos: string[] = [];
    const { rerender } = tempEditor({
      doc: doc(p("foo")),
      nodeViews: {
        paragraph: forwardRef<HTMLParagraphElement, NodeViewComponentProps>(
          function Paragraph(props, ref) {
            innerDecos = (props.nodeProps.innerDecorations as DecorationSet)
              .find()
              .map((d) => `${d.from}-${d.to}`);
            return <p ref={ref}>{props.children}</p>;
          }
        ),
      },
    });

    rerender({
      decorations(state) {
        return DecorationSet.create(state.doc, [
          Decoration.inline(2, 3, { someattr: "ok" }),
          Decoration.node(0, 5, { otherattr: "ok" }),
        ]);
      },
    });

    expect(innerDecos.join()).toBe("1-2");
  });

  it("can provide a stopEvent hook", async () => {
    tempEditor({
      doc: doc(p("input value")),
      nodeViews: {
        paragraph: forwardRef<HTMLInputElement, NodeViewComponentProps>(
          function ParagraphInput({ nodeProps, children, ...props }, ref) {
            useStopEvent(() => {
              return true;
            });
            return (
              <input
                {...props}
                ref={ref}
                type="text"
                defaultValue={nodeProps.node.textContent}
              />
            );
          }
        ),
      },
    });

    const input = screen.getByDisplayValue("input value");
    input.focus();
    await browser.keys("z");

    expect(await $(input).getValue()).toBe("input valuez");
  });
});

describe("customNodeViews prop", () => {
  it("can replace a node's representation", async () => {
    const { view } = tempEditor({
      doc: doc(p("foo", br())),
      customNodeViews: {
        hard_break() {
          return {
            dom: document.createElement("var"),
          };
        },
      },
    });
    expect(view.dom.querySelector("var")).not.toBeNull();
  });

  it("can override drawing of a node's content", async () => {
    const { view } = tempEditor({
      doc: doc(p("foo")),
      customNodeViews: {
        paragraph(node) {
          const dom = document.createElement("p");
          dom.appendChild(
            document.createTextNode(node.textContent.toUpperCase())
          );
          return {
            dom,
          };
        },
      },
    });
    expect(view.dom.querySelector("p")!.textContent).toBe("FOO");
  });

  it("can register its own update method", async () => {
    const { view } = tempEditor({
      doc: doc(p("foo")),
      customNodeViews: {
        paragraph(node) {
          const dom = document.createElement("p");
          dom.textContent = node.textContent.toUpperCase();
          return {
            dom,
            update(node) {
              dom.textContent = node.textContent.toUpperCase();
              return true;
            },
          };
        },
      },
    });
    const para = view.dom.querySelector("p")!;
    view.dispatch(view.state.tr.insertText("a"));
    expect(view.dom.querySelector("p")).toBe(para);
    expect(para.textContent).toBe("AFOO");
  });

  it("allows decoration updates for node views with an update method", async () => {
    const { view, rerender } = tempEditor({
      doc: doc(p("foo")),
      customNodeViews: {
        paragraph(node) {
          const dom = document.createElement("p");
          return {
            dom,
            contentDOM: dom,
            update(node_) {
              return node.sameMarkup(node_);
            },
          };
        },
      },
    });

    rerender({
      decorations(state) {
        return DecorationSet.create(state.doc, [
          Decoration.inline(2, 3, { someattr: "ok" }),
          Decoration.node(0, 5, { otherattr: "ok" }),
        ]);
      },
    });

    expect(view.dom.querySelector("[someattr]")).not.toBeNull();
    expect(view.dom.querySelector("[otherattr]")).not.toBeNull();
  });

  it("can provide a contentDOM property", async () => {
    const { view } = tempEditor({
      doc: doc(p("foo")),
      customNodeViews: {
        paragraph() {
          const dom = document.createElement("p");
          return { dom, contentDOM: dom };
        },
      },
    });
    const para = view.dom.querySelector("p")!;
    view.dispatch(view.state.tr.insertText("a"));
    expect(view.dom.querySelector("p")).toBe(para);
    expect(para.textContent).toBe("afoo");
  });

  // Skipping for now... We don't use a mutation observer to
  // detect changes, so we don't have an obvious place to call
  // ignoreMutation at the moment.
  // TODO: Add this check to beforeInputPlugin
  // eslint-disable-next-line jest/no-disabled-tests
  it.skip("has its ignoreMutation method called", async () => {
    let mutation: ViewMutationRecord | undefined;
    const { view } = tempEditor({
      doc: doc(p("foo")),
      customNodeViews: {
        paragraph() {
          const dom = document.createElement("div");
          const contentDOM = document.createElement("p");
          const info = document.createElement("x-info");
          dom.append(contentDOM, info);
          return {
            dom,
            contentDOM,
            ignoreMutation: (m) => {
              mutation = m;
              return true;
            },
          };
        },
      },
    });
    expect(mutation).toBeFalsy();
    view.dispatch(view.state.tr.delete(3, 5));
    expect(mutation).toBeTruthy();
    expect((mutation!.target as HTMLElement).tagName).toBe("X-INFO");
  });

  it("has its destroy method called", async () => {
    let destroyed = 0;
    const { view } = tempEditor({
      doc: doc(p("foo", br())),
      customNodeViews: {
        hard_break() {
          return {
            dom: document.createElement("br"),
            destroy: () => destroyed++,
          };
        },
      },
    });
    // TODO: This gets destroyed once essentially
    // immediately, due to the dummy EditorView that
    // we create and then immediately destroy for SSR
    expect(destroyed).toBe(1);
    view.dispatch(view.state.tr.delete(3, 5));
    expect(destroyed).toBe(2);
  });

  it("can query its own position", async () => {
    let get: () => number | undefined;
    const { view } = tempEditor({
      doc: doc(blockquote(p("abc"), p("foo", br()))),
      customNodeViews: {
        hard_break(_n, _v, getPos) {
          expect(getPos()).toBe(10);
          get = getPos;
          return { dom: document.createElement("br") };
        },
      },
    });
    expect(get!()).toBe(10);
    view.dispatch(view.state.tr.insertText("a"));
    expect(get!()).toBe(11);
  });

  it("has access to outer decorations", async () => {
    const plugin = new Plugin({
      state: {
        init() {
          return null;
        },
        apply(tr, prev) {
          return tr.getMeta("setDeco") || prev;
        },
      },
      props: {
        decorations(this: Plugin, state) {
          const deco = this.getState(state);
          return (
            deco &&
            DecorationSet.create(state.doc, [
              Decoration.inline(0, state.doc.content.size, {}, {
                name: deco,
              } as any),
            ])
          );
        },
      },
    });
    const { view } = tempEditor({
      doc: doc(p("foo", br())),
      plugins: [plugin],
      customNodeViews: {
        hard_break(_n, _v, _p, deco) {
          const dom = document.createElement("var");
          function update(deco: readonly Decoration[]) {
            dom.textContent = deco.length ? deco[0]!.spec.name : "[]";
          }
          update(deco);
          return {
            dom,
            update(_, deco) {
              update(deco);
              return true;
            },
          };
        },
      },
    });
    expect(view.dom.querySelector("var")!.textContent).toBe("[]");
    view.dispatch(view.state.tr.setMeta("setDeco", "foo"));
    expect(view.dom.querySelector("var")!.textContent).toBe("foo");
    view.dispatch(view.state.tr.setMeta("setDeco", "bar"));
    expect(view.dom.querySelector("var")!.textContent).toBe("bar");
  });

  it("provides access to inner decorations in the constructor", async () => {
    tempEditor({
      doc: doc(p("foo")),
      customNodeViews: {
        paragraph(_node, _v, _pos, _outer, innerDeco) {
          const dom = document.createElement("p");
          expect(
            (innerDeco as DecorationSet)
              .find()
              .map((d) => `${d.from}-${d.to}`)
              .join()
          ).toBe("1-2");
          return { dom, contentDOM: dom };
        },
      },
      decorations(state) {
        return DecorationSet.create(state.doc, [
          Decoration.inline(2, 3, { someattr: "ok" }),
          Decoration.node(0, 5, { otherattr: "ok" }),
        ]);
      },
    });
  });

  it("provides access to inner decorations in the update method", async () => {
    let innerDecos: string[] = [];
    const { rerender } = tempEditor({
      doc: doc(p("foo")),
      customNodeViews: {
        paragraph(node) {
          const dom = document.createElement("p");
          return {
            dom,
            contentDOM: dom,
            update(node_, _, innerDecoSet) {
              innerDecos = (innerDecoSet as DecorationSet)
                .find()
                .map((d) => `${d.from}-${d.to}`);
              return node.sameMarkup(node_);
            },
          };
        },
      },
    });

    rerender({
      decorations(state) {
        return DecorationSet.create(state.doc, [
          Decoration.inline(2, 3, { someattr: "ok" }),
          Decoration.node(0, 5, { otherattr: "ok" }),
        ]);
      },
    });

    expect(innerDecos.join()).toBe("1-2");
  });

  it("can provide a stopEvent hook", async () => {
    tempEditor({
      doc: doc(p("input value")),
      customNodeViews: {
        paragraph(node) {
          const dom = document.createElement("input");
          dom.value = node.textContent;

          return {
            dom,
            stopEvent() {
              return true;
            },
          };
        },
      },
    });

    const input = screen.getByDisplayValue("input value");
    input.focus();
    await browser.keys("z");

    expect(await $(input).getValue()).toBe("input valuez");
  });
});
