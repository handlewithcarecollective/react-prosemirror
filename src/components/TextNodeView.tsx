import { Node } from "prosemirror-model";
import { TextSelection } from "prosemirror-state";
import { DOMEventMap, Decoration, DecorationSet } from "prosemirror-view";
import { Component, MutableRefObject, createRef } from "react";

import { AbstractEditorView } from "../AbstractEditorView.js";
import { ReactEditorView } from "../ReactEditorView.js";
import { findDOMNode } from "../findDOMNode.js";
import { EventHandler } from "../hooks/useComponentEventListeners.js";
import {
  CompositionViewDesc,
  TextViewDesc,
  ViewDesc,
  findTextInFragment,
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
  view: AbstractEditorView;
  node: Node;
  getPos: () => number;
  siblingsRef: MutableRefObject<ViewDesc[]>;
  parentRef: MutableRefObject<ViewDesc | undefined>;
  findCompositionDOM: (compositionViewDesc: CompositionViewDesc) => void;
  decorations: readonly Decoration[];
  registerEventListener<EventType extends keyof DOMEventMap>(
    eventType: EventType,
    handler: EventHandler<EventType>
  ): void;
  unregisterEventListener<EventType extends keyof DOMEventMap>(
    eventType: EventType,
    handler: EventHandler<EventType>
  ): void;
};

export class TextNodeView extends Component<Props> {
  viewDescRef = createMutRef<TextViewDesc | CompositionViewDesc>();
  renderRef = createMutRef<JSX.Element>();
  wasProtecting = createMutRef<boolean>();
  containsCompositionNodeText = createMutRef<boolean>();

  // This is basically NodeViewDesc.localCompositionInfo
  // from prosemirror-view. It's been slightly adjusted so that
  // it can be used accurately during render, before we've
  // necessarily found (or even let the browser create)
  // view.input.compositionNode
  shouldProtect(props: Props): boolean {
    const { view, getPos, node } = props;

    if (!(view instanceof ReactEditorView)) return false;
    if (!view.composing) {
      return false;
    }

    const viewDesc = this.viewDescRef.current;
    // If our DOM text node IS the IME's composition node, protect regardless
    // of where the PM selection currently is. The IME may have replaced a
    // selection that included us — moving the PM selection past us — but our
    // DOM is still part of the in-progress composition. Until another
    // TextNodeView's findCompositionDOM displaces us into a comp desc, only
    // our own protect/no-update is preventing React from rewriting the IME's
    // text. (When we *are* displaced, viewDesc is already a CompositionViewDesc
    // and the existing position-based logic doesn't apply anyway.)
    const ownsCompositionNode =
      viewDesc instanceof TextViewDesc &&
      viewDesc.nodeDOM === view.input.compositionNode;

    if (!ownsCompositionNode) {
      const pos = getPos();
      const { from, to } = view.state.selection;
      if (
        !(view.state.selection instanceof TextSelection) ||
        from <= pos ||
        to > pos + node.nodeSize
      ) {
        return false;
      }
    }

    return !!this.containsCompositionNodeText.current;
  }

  handleCompositionEnd = () => {
    if (!this.wasProtecting.current) return;
    this.forceUpdate();
    return;
  };

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

    let viewDesc!: CompositionViewDesc | TextViewDesc;

    if (this.shouldProtect(this.props)) {
      viewDesc = new CompositionViewDesc(
        parentRef.current,
        getPos,
        // If we can't
        // actually find the correct DOM nodes from here (
        // which is the case in a composition in a newly
        // created text node), we let our parent do it.
        // Passing a valid element here just so that the
        // ViewDesc constructor doesn't blow up.
        dom ?? document.createElement("div"),
        textNode ?? document.createTextNode(node.text ?? ""),
        node.text ?? ""
      );
    } else {
      if (!dom || !textNode) return null;

      viewDesc = new TextViewDesc(
        parentRef.current,
        [],
        getPos,
        node,
        decorations,
        DecorationSet.empty,
        dom,
        textNode
      );
    }

    siblingsRef.current.push(viewDesc);
    siblingsRef.current.sort(sortViewDescs);

    if (viewDesc instanceof CompositionViewDesc) {
      this.props.findCompositionDOM(viewDesc);
    }

    return viewDesc;
  }

  update() {
    const { view, node, decorations } = this.props;

    if (!(view instanceof ReactEditorView)) return false;

    const viewDesc = this.viewDescRef.current;
    if (!viewDesc) return false;

    // Don't force destroy/recreate just because we transitioned into protect
    // mode. If our DOM text node is the IME's composition node, we want to
    // keep the TextViewDesc alive so the new composition-text TextNodeView's
    // findCompositionDOM second pass can find us, validate the size mismatch,
    // and displace us into a properly-sized CompositionViewDesc. If we
    // destroyed here, create() would put a wrong-size CompositionViewDesc on
    // T and pre-empt that displacement.
    const ownsCompositionNode =
      viewDesc instanceof TextViewDesc &&
      viewDesc.nodeDOM === view.input.compositionNode;
    if (
      !ownsCompositionNode &&
      this.shouldProtect(this.props) !== viewDesc instanceof CompositionViewDesc
    ) {
      return false;
    }

    if (viewDesc instanceof CompositionViewDesc) return false;

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

    const { view } = this.props;
    if (!(view instanceof ReactEditorView)) {
      this.containsCompositionNodeText.current = true;
      return;
    }

    const textNode = view.input.compositionNode;

    if (!textNode) {
      this.containsCompositionNodeText.current = true;
      return;
    }

    // Resolve the parent textblock containing this text node and ask
    // findTextInFragment whether the IME text node's *current* content can be
    // placed somewhere in the textblock's PM content overlapping the
    // selection. If it can, the composition is still consistent with PM state
    // and we should protect. If it can't (e.g. a remote change overwrote the
    // composing region), PM and the DOM have diverged — abandon protection
    // so the re-render can rewrite the DOM and cancel the composition.
    const $pos = view.state.doc.resolve(this.props.getPos());
    const parent = $pos.parent;
    if (!parent.inlineContent) {
      this.containsCompositionNodeText.current = false;
      return;
    }
    const parentStart = $pos.start();
    const { from, to } = view.state.selection;
    const textPos = findTextInFragment(
      parent.content,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      textNode.nodeValue!,
      from - parentStart,
      to - parentStart
    );
    this.containsCompositionNodeText.current = textPos >= 0;
  }

  shouldComponentUpdate(nextProps: Props): boolean {
    // When leaving the protected state, force a re-render so React's
    // virtual DOM resyncs with whatever the IME wrote into the real DOM
    // while we were returning a stale renderRef.
    if (this.wasProtecting.current && !this.shouldProtect(nextProps)) {
      return true;
    }
    return !shallowEqual(this.props, nextProps);
  }

  constructor(props: Props) {
    super(props);
    this.viewDescRef.current = null;
    this.renderRef.current = null;
    this.wasProtecting.current = false;
    this.containsCompositionNodeText.current = true;
  }

  componentDidMount(): void {
    this.containsCompositionNodeText.current = true;

    // After a composition, force an update so that we re-check whether we need
    // to be protecting our rendered content and allow React to re-sync with the
    // DOM.
    const { registerEventListener } = this.props;
    registerEventListener("compositionend", this.handleCompositionEnd);

    this.viewDescRef.current = this.create();
    this.updateEffect();
  }

  componentDidUpdate(): void {
    this.updateEffect();
  }

  componentWillUnmount(): void {
    const { unregisterEventListener } = this.props;
    unregisterEventListener("compositionend", this.handleCompositionEnd);

    this.destroy();
  }

  render() {
    const { node, decorations } = this.props;

    // During a composition, it's crucial that we don't try to
    // update the DOM that the user is working in. If there's
    // an active composition and the selection is in this node,
    // we freeze the DOM of this element so that it doesn't
    // interrupt the composition
    if (this.shouldProtect(this.props)) {
      this.wasProtecting.current = true;
      return this.renderRef.current;
    }

    this.wasProtecting.current = false;

    this.renderRef.current = decorations.reduce(
      wrapInDeco,
      node.text as unknown as JSX.Element
    );

    return this.renderRef.current;
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
