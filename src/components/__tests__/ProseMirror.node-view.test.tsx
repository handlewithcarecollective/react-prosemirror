/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { act, screen } from "@testing-library/react";
import { Plugin } from "prosemirror-state";
import { blockquote, br, doc, p, strong } from "prosemirror-test-builder";
import {
  Decoration,
  DecorationSet,
  ViewMutationRecord,
} from "prosemirror-view";
import React, { forwardRef, useEffect, useState } from "react";

import { useEditorState } from "../../hooks/useEditorState.js";
import { useStopEvent } from "../../hooks/useStopEvent.js";
import { useMergedDOMRefs } from "../../refs.js";
import {
  findTextNode,
  tempEditor,
} from "../../testing/editorViewTestHelpers.js";
import { MarkViewComponentProps } from "../marks/MarkViewComponentProps.js";
import { NodeViewComponentProps } from "../nodes/NodeViewComponentProps.js";

describe("nodeViewComponents prop", () => {
  it("can replace a node's representation", async () => {
    const { view } = tempEditor({
      doc: doc(p("foo", br())),
      nodeViewComponents: {
        hard_break: forwardRef<HTMLElement, NodeViewComponentProps>(
          function Var(props, ref) {
            return (
              <var ref={useMergedDOMRefs(props.nodeProps.contentDOMRef, ref)}>
                {props.children}
              </var>
            );
          }
        ),
      },
    });
    expect(view.dom.querySelector("var")).not.toBeNull();
  });

  it("can override drawing of a node's content", async () => {
    const { view } = tempEditor({
      doc: doc(p("foo")),
      nodeViewComponents: {
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
      nodeViewComponents: {
        paragraph: forwardRef<HTMLParagraphElement, NodeViewComponentProps>(
          function Paragraph(props, ref) {
            return (
              <p ref={useMergedDOMRefs(ref, props.nodeProps.contentDOMRef)}>
                {props.nodeProps.node.textContent.toUpperCase()}
              </p>
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
      nodeViewComponents: {
        paragraph: forwardRef<HTMLParagraphElement, NodeViewComponentProps>(
          function Paragraph({ children, nodeProps, ...props }, ref) {
            return (
              <p
                {...props}
                ref={useMergedDOMRefs(ref, nodeProps.contentDOMRef)}
              >
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
      nodeViewComponents: {
        paragraph: forwardRef<HTMLParagraphElement, NodeViewComponentProps>(
          function Paragraph(props, ref) {
            return (
              <p ref={useMergedDOMRefs(ref, props.nodeProps.contentDOMRef)}>
                {props.children}
              </p>
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

  it("does not re-render indefinitely when the node view uses an unstable ref callback", async () => {
    let renders = 0;
    const { view } = tempEditor({
      doc: doc(p("foo")),
      nodeViewComponents: {
        paragraph: forwardRef<HTMLParagraphElement, NodeViewComponentProps>(
          function Paragraph({ children, nodeProps }, ref) {
            renders++;
            const contentDOMRef = nodeProps.contentDOMRef as (
              el: HTMLElement | null
            ) => void;
            const setRef = (el: HTMLParagraphElement | null) => {
              if (ref) {
                if (typeof ref === "function") ref(el);
                else ref.current = el;
              }
              contentDOMRef(el);
            };
            return <p ref={setRef}>{children}</p>;
          }
        ),
      },
    });

    const para = view.dom.querySelector("p")!;
    const base = renders;
    act(() => {
      view.dispatch(view.state.tr.insertText("a"));
    });

    expect(renders).toBe(base + 1);
    expect(view.dom.querySelector("p")).toBe(para);
    expect(para.textContent).toBe("afoo");
  });

  it("keeps its view desc when an unstable ref callback churns on re-render", async () => {
    let renders = 0;
    let bump: () => void;
    const { view } = tempEditor({
      doc: doc(p("hello")),
      nodeViewComponents: {
        paragraph: forwardRef<HTMLParagraphElement, NodeViewComponentProps>(
          function Paragraph({ children }, ref) {
            renders++;
            const [version, setVersion] = useState(0);
            bump = () => setVersion((v) => v + 1);
            const setRef = (el: HTMLParagraphElement | null) => {
              if (ref) {
                if (typeof ref === "function") ref(el);
                else ref.current = el;
              }
            };
            return (
              <p ref={setRef} data-version={version}>
                {children}
              </p>
            );
          }
        ),
      },
    });

    const para = view.dom.querySelector("p")!;
    const text = findTextNode(para, "hello");
    const desc = para.pmViewDesc;
    expect(desc).toBeTruthy();
    const base = renders;
    act(() => {
      bump();
    });

    expect(renders).toBe(base + 1);
    expect(para.pmViewDesc).toBe(desc);
    for (let i = 0; i <= 5; i++) {
      expect(view.posAtDOM(text, i)).toBe(1 + i);
    }
  });

  it("recreates its view desc when the contentDOM element is removed and restored", async () => {
    let renders = 0;
    let toggle: (show: boolean) => void;
    const { view } = tempEditor({
      doc: doc(p("foo")),
      nodeViewComponents: {
        paragraph: forwardRef<HTMLParagraphElement, NodeViewComponentProps>(
          function Paragraph({ children, nodeProps, ...props }, ref) {
            renders++;
            const [showContentDOM, setShowContentDOM] = useState(true);
            toggle = setShowContentDOM;
            return (
              <p {...props} ref={ref}>
                {showContentDOM ? (
                  <span ref={nodeProps.contentDOMRef}>{children}</span>
                ) : (
                  children
                )}
              </p>
            );
          }
        ),
      },
    });

    const para = view.dom.querySelector("p")!;
    const desc = para.pmViewDesc;
    expect(desc).toBeTruthy();
    expect(para.getAttribute("contenteditable")).toBeNull();
    const base = renders;

    await act(async () => {
      toggle(false);
    });
    expect(renders).toBe(base + 2);
    expect(para.getAttribute("contenteditable")).toBe("false");
    expect(para.pmViewDesc).toBeTruthy();
    expect(para.pmViewDesc).not.toBe(desc);
    const text = findTextNode(para, "foo");
    for (let i = 0; i <= 3; i++) {
      expect(view.posAtDOM(text, i)).toBe(1 + i);
    }

    act(() => {
      toggle(true);
    });

    expect(renders).toBe(base + 4);
    expect(para.getAttribute("contenteditable")).toBeNull();
    expect(para.pmViewDesc).toBeTruthy();
    const restoredText = findTextNode(para, "foo");
    for (let i = 0; i <= 3; i++) {
      expect(view.posAtDOM(restoredText, i)).toBe(1 + i);
    }
  });

  it("has its destroy method called", async () => {
    let destroyed = 0;
    const { view } = tempEditor({
      doc: doc(p("foo", br())),
      nodeViewComponents: {
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
    view.dispatch(view.state.tr.delete(3, 5));
    expect(destroyed).toBe(1);
  });

  it("destroys its node view exactly once when the node is removed", async () => {
    let destroyed = 0;
    const { view } = tempEditor({
      doc: doc(p("foo", br())),
      nodeViewComponents: {
        hard_break: forwardRef<HTMLBRElement, NodeViewComponentProps>(
          function BR(_props, ref) {
            useEffect(() => {
              return () => {
                destroyed++;
              };
            }, []);
            const setRef = (el: HTMLBRElement | null) => {
              if (ref) {
                if (typeof ref === "function") ref(el);
                else ref.current = el;
              }
            };
            return <br ref={setRef} />;
          }
        ),
      },
    });

    act(() => {
      view.dispatch(view.state.tr.delete(3, 5));
    });

    expect(destroyed).toBe(1);
  });

  it("can query its own position", async () => {
    let pos: number | undefined;
    const { view } = tempEditor({
      doc: doc(blockquote(p("abc"), p("foo", br()))),
      nodeViewComponents: {
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
      nodeViewComponents: {
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
      nodeViewComponents: {
        paragraph: forwardRef<HTMLParagraphElement, NodeViewComponentProps>(
          function Paragraph(props, ref) {
            expect(
              (props.nodeProps.innerDecorations as DecorationSet)
                .find()
                .map((d) => `${d.from}-${d.to}`)
                .join()
            ).toBe("1-2");
            return (
              <p ref={useMergedDOMRefs(ref, props.nodeProps.contentDOMRef)}>
                {props.children}
              </p>
            );
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
      nodeViewComponents: {
        paragraph: forwardRef<HTMLParagraphElement, NodeViewComponentProps>(
          function Paragraph(props, ref) {
            innerDecos = (props.nodeProps.innerDecorations as DecorationSet)
              .find()
              .map((d) => `${d.from}-${d.to}`);
            return (
              <p ref={useMergedDOMRefs(ref, props.nodeProps.contentDOMRef)}>
                {props.children}
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

    expect(innerDecos.join()).toBe("1-2");
  });

  it("can provide a stopEvent hook", async () => {
    tempEditor({
      doc: doc(p("input value")),
      nodeViewComponents: {
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

describe("markViewComponents prop", () => {
  it("can replace a mark's representation", async () => {
    const { view } = tempEditor({
      doc: doc(p(strong("foo"), br())),
      markViewComponents: {
        strong: forwardRef<HTMLElement, MarkViewComponentProps>(function Var(
          props,
          ref
        ) {
          return <var ref={ref}>{props.children}</var>;
        }),
      },
    });
    expect(view.dom.querySelector("var")).not.toBeNull();
    expect(view.dom.querySelector("var")?.textContent).toBe("foo");
  });

  it("provide a contentDOM property", async () => {
    const { view } = tempEditor({
      doc: doc(p(strong("foo"))),
      markViewComponents: {
        strong: forwardRef<HTMLElement, MarkViewComponentProps>(function Strong(
          props,
          ref
        ) {
          return (
            <strong ref={useMergedDOMRefs(ref, props.markProps.contentDOMRef)}>
              {props.children}
            </strong>
          );
        }),
      },
    });
    const para = view.dom.querySelector("p")!;
    view.dispatch(view.state.tr.insertText("a"));
    expect(view.dom.querySelector("p")).toBe(para);
    expect(para.textContent).toBe("afoo");
  });

  it("keeps its view desc when an unstable ref callback churns on re-render", async () => {
    let renders = 0;
    let bump: () => void;
    const { view } = tempEditor({
      doc: doc(p(strong("hello"))),
      markViewComponents: {
        strong: forwardRef<HTMLElement, MarkViewComponentProps>(function Strong(
          { children },
          ref
        ) {
          renders++;
          const [version, setVersion] = useState(0);
          bump = () => setVersion((v) => v + 1);
          const setRef = (el: HTMLElement | null) => {
            if (ref) {
              if (typeof ref === "function") ref(el);
              else ref.current = el;
            }
          };
          return (
            <strong ref={setRef} data-version={version}>
              {children}
            </strong>
          );
        }),
      },
    });

    const strongEl = view.dom.querySelector("strong")!;
    const text = findTextNode(strongEl, "hello");
    const desc = strongEl.pmViewDesc;
    expect(desc).toBeTruthy();
    const base = renders;
    act(() => {
      bump();
    });

    expect(renders).toBe(base + 1);
    expect(strongEl.pmViewDesc).toBe(desc);
    for (let i = 0; i <= 5; i++) {
      expect(view.posAtDOM(text, i)).toBe(1 + i);
    }
  });

  it("has its destroy method called", async () => {
    let destroyed = 0;
    const { view } = tempEditor({
      doc: doc(p("a", strong("foo"), "b")),
      markViewComponents: {
        strong: forwardRef<HTMLElement, MarkViewComponentProps>(function Strong(
          props,
          ref
        ) {
          // React implements "destroy methods" with effect
          // hooks
          useEffect(() => {
            return () => {
              destroyed++;
            };
          }, []);
          return <strong ref={ref}>{props.children}</strong>;
        }),
      },
    });
    view.dispatch(view.state.tr.delete(2, 6));
    expect(destroyed).toBe(1);
  });

  it("can query its own position", async () => {
    let pos: number | undefined;
    const { view } = tempEditor({
      doc: doc(blockquote(p("abc"), p(strong("foo"), br()))),
      markViewComponents: {
        strong: forwardRef<HTMLElement, MarkViewComponentProps>(function Strong(
          { markProps, children, ...props },
          ref
        ) {
          // trigger a re-render on every update, otherwise we won't
          // re-render when an updated doesn't directly affect us
          useEditorState();
          pos = markProps.getPos();
          return <strong {...props} ref={ref} />;
        }),
      },
    });
    expect(pos).toBe(7);
    view.dispatch(view.state.tr.insertText("a"));
    expect(pos).toBe(8);
  });
});

describe("nodeViews prop", () => {
  it("can replace a node's representation", async () => {
    const { view } = tempEditor({
      doc: doc(p("foo", br())),
      nodeViews: {
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
      nodeViews: {
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

  // React makes this more or less trivial; the render
  // method of the component _is_ the update (and create)
  // method
  // eslint-disable-next-line jest/no-disabled-tests
  it.skip("can register its own update method", async () => {
    const { view } = tempEditor({
      doc: doc(p("foo", br())),
      nodeViews: {
        hard_break() {
          return {
            dom: document.createElement("var"),
          };
        },
      },
    });
    expect(view.dom.querySelector("var")).not.toBeNull();
  });

  it("allows decoration updates for node views with an update method", async () => {
    const { view, rerender } = tempEditor({
      doc: doc(p("foo")),
      nodeViews: {
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
      nodeViews: {
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
      nodeViews: {
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
      nodeViews: {
        hard_break() {
          return {
            dom: document.createElement("br"),
            destroy: () => destroyed++,
          };
        },
      },
    });
    view.dispatch(view.state.tr.delete(3, 5));
    expect(destroyed).toBe(1);
  });

  it("can query its own position", async () => {
    let get: () => number | undefined;
    const { view } = tempEditor({
      doc: doc(blockquote(p("abc"), p("foo", br()))),
      nodeViews: {
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
      nodeViews: {
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
      nodeViews: {
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
      nodeViews: {
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
      nodeViews: {
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
