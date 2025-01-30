import { Node } from "prosemirror-model";
import { Decoration, DecorationSet, EditorView } from "prosemirror-view";
import { Component, MutableRefObject } from "react";

import { findDOMNode } from "../findDOMNode.js";
import {
  CompositionViewDesc,
  TextViewDesc,
  ViewDesc,
  sortViewDescs,
} from "../viewdesc.js";

import { wrapInDeco } from "./ChildNodeViews.js";

function shallowEqual(
  objA: Record<string, unknown>,
  objB: Record<string, unknown>
): boolean {
  if (objA === objB) {
    return true;
  }

  if (!objA || !objB) {
    return false;
  }

  const aKeys = Object.keys(objA);
  const bKeys = Object.keys(objB);
  const len = aKeys.length;

  if (bKeys.length !== len) {
    return false;
  }

  for (let i = 0; i < len; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const key = aKeys[i]!;

    if (
      objA[key] !== objB[key] ||
      !Object.prototype.hasOwnProperty.call(objB, key)
    ) {
      return false;
    }
  }

  return true;
}

type Props = {
  view: EditorView | null;
  node: Node;
  getPos: MutableRefObject<() => number>;
  siblingsRef: MutableRefObject<ViewDesc[]>;
  parentRef: MutableRefObject<ViewDesc | undefined>;
  decorations: readonly Decoration[];
};

export class TextNodeView extends Component<Props> {
  private viewDescRef: null | TextViewDesc | CompositionViewDesc = null;
  private renderRef: null | JSX.Element = null;

  updateEffect() {
    const { view, decorations, siblingsRef, parentRef, getPos, node } =
      this.props;
    // There simply is no other way to ref a text node
    // eslint-disable-next-line react/no-find-dom-node
    const dom = findDOMNode(this);

    // We only need to explicitly create a CompositionViewDesc
    // when a composition was started that produces a new text node.
    // Otherwise we just rely on re-rendering the renderRef
    if (!dom) {
      if (!view?.composing) return;

      this.viewDescRef = new CompositionViewDesc(
        parentRef.current,
        () => getPos.current(),
        // These are just placeholders/dummies. We can't
        // actually find the correct DOM nodes from here,
        // so we let our parent do it.
        // Passing a valid element here just so that the
        // ViewDesc constructor doesn't blow up.
        document.createElement("div"),
        document.createTextNode(node.text ?? ""),
        node.text ?? ""
      );

      return;
    }

    let textNode = dom;
    while (textNode.firstChild) {
      textNode = textNode.firstChild as Element | Text;
    }

    if (!this.viewDescRef || this.viewDescRef instanceof CompositionViewDesc) {
      this.viewDescRef = new TextViewDesc(
        undefined,
        [],
        () => getPos.current(),
        node,
        decorations,
        DecorationSet.empty,
        dom,
        textNode
      );
    } else {
      this.viewDescRef.parent = parentRef.current;
      this.viewDescRef.children = [];
      this.viewDescRef.node = node;
      this.viewDescRef.getPos = () => getPos.current();
      this.viewDescRef.outerDeco = decorations;
      this.viewDescRef.innerDeco = DecorationSet.empty;
      this.viewDescRef.dom = dom;
      // @ts-expect-error We have our own ViewDesc implementations
      this.viewDescRef.dom.pmViewDesc = this.viewDescRef;
      this.viewDescRef.nodeDOM = textNode;
    }

    if (!siblingsRef.current.includes(this.viewDescRef)) {
      siblingsRef.current.push(this.viewDescRef);
    }

    siblingsRef.current.sort(sortViewDescs);
  }

  shouldComponentUpdate(nextProps: Props): boolean {
    return !shallowEqual(this.props, nextProps);
  }

  componentDidMount(): void {
    this.updateEffect();
  }

  componentDidUpdate(): void {
    this.updateEffect();
  }

  componentWillUnmount(): void {
    const { siblingsRef } = this.props;
    if (!this.viewDescRef) return;
    if (siblingsRef.current.includes(this.viewDescRef)) {
      const index = siblingsRef.current.indexOf(this.viewDescRef);
      siblingsRef.current.splice(index, 1);
    }
  }

  render() {
    const { view, getPos, node, decorations } = this.props;

    // During a composition, it's crucial that we don't try to
    // update the DOM that the user is working in. If there's
    // an active composition and the selection is in this node,
    // we freeze the DOM of this element so that it doesn't
    // interrupt the composition
    if (
      view?.composing &&
      view.state.selection.from >= getPos.current() &&
      view.state.selection.from <= getPos.current() + node.nodeSize
    ) {
      return this.renderRef;
    }

    this.renderRef = decorations.reduce(
      wrapInDeco,
      node.text as unknown as JSX.Element
    );

    return this.renderRef;
  }
}
