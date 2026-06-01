import { Node } from "prosemirror-model";
import { Decoration, DecorationSet } from "prosemirror-view";
import { Component, MutableRefObject, createRef } from "react";

import { AbstractEditorView } from "../AbstractEditorView.js";
import { ReactEditorView } from "../ReactEditorView.js";
import { findDOMNode } from "../findDOMNode.js";
import { TextViewDesc, ViewDesc, sortViewDescs } from "../viewdesc.js";

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
  view: AbstractEditorView;
  node: Node;
  getPos: () => number;
  siblingsRef: MutableRefObject<ViewDesc[]>;
  parentRef: MutableRefObject<ViewDesc | undefined>;
  decorations: readonly Decoration[];
};

export class TextNodeView extends Component<Props> {
  viewDescRef = createMutRef<TextViewDesc>();

  create() {
    const { view, decorations, siblingsRef, parentRef, getPos, node } =
      this.props;
    const dom = findDOMNode(this);

    if (!dom && !view.composing) return null;

    let textNode: ChildNode | null = dom;
    while (textNode?.firstChild) {
      textNode = textNode.firstChild;
    }

    if (!(textNode instanceof Text)) {
      textNode = null;
    }

    if (!dom || !textNode) return null;

    const viewDesc = new TextViewDesc(
      parentRef.current,
      [],
      getPos,
      node,
      decorations,
      DecorationSet.empty,
      dom,
      textNode
    );

    siblingsRef.current.push(viewDesc);
    siblingsRef.current.sort(sortViewDescs);

    return viewDesc;
  }

  update() {
    const { view, node, decorations } = this.props;

    if (!(view instanceof ReactEditorView)) return false;

    const viewDesc = this.viewDescRef.current;
    if (!viewDesc) return false;

    const dom = findDOMNode(this);
    if (!dom || dom !== viewDesc.dom) return false;

    if (!dom.contains(viewDesc.nodeDOM)) return false;

    return (
      viewDesc.matchesNode(node, decorations, DecorationSet.empty) ||
      viewDesc.update(node, decorations, DecorationSet.empty, view)
    );
  }

  destroy() {
    const viewDesc = this.viewDescRef.current;
    if (!viewDesc) return;

    viewDesc.destroy();

    const siblings = this.props.siblingsRef.current;

    if (siblings.includes(viewDesc)) {
      const index = siblings.indexOf(viewDesc);
      siblings.splice(index, 1);
    }
  }

  updateEffect() {
    if (!this.update()) {
      this.destroy();
      this.viewDescRef.current = this.create();
    }
  }

  shouldComponentUpdate(nextProps: Props): boolean {
    return !shallowEqual(this.props, nextProps);
  }

  constructor(props: Props) {
    super(props);
    this.viewDescRef.current = null;
  }

  componentDidMount(): void {
    this.viewDescRef.current = this.create();
    this.updateEffect();
  }

  componentDidUpdate(): void {
    this.updateEffect();
    const { view } = this.props;
    if (!(view instanceof ReactEditorView)) return;
  }

  componentWillUnmount(): void {
    this.destroy();
  }

  render() {
    const { node, decorations } = this.props;

    return decorations.reduce(wrapInDeco, node.text as unknown as JSX.Element);
  }
}

/**
 * createRef returns a RefObject, even though the docs
 * say that it's acceptible to manage the ref's value
 * yourself.
 */
function createMutRef<T>(): MutableRefObject<T | null> {
  return createRef();
}
