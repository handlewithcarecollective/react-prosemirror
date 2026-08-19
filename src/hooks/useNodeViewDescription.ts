import { NodeViewConstructor } from "prosemirror-view";
import { useCallback, useContext, useMemo, useRef } from "react";

import { ReactEditorView } from "../ReactEditorView.js";
import { NodeViewComponentProps } from "../components/nodes/NodeViewComponentProps.js";
import { ChildDescriptionsContext } from "../contexts/ChildDescriptionsContext.js";
import { EditorContext } from "../contexts/EditorContext.js";
import {
  NodeViewDesc,
  ReactNodeViewDesc,
  ViewDesc,
  sortViewDescs,
} from "../viewdesc.js";

import { useClientLayoutEffect } from "./useClientLayoutEffect.js";
import { useEffectEvent } from "./useEffectEvent.js";

type Props = Omit<NodeViewComponentProps["nodeProps"], "contentDOMRef">;

export function useNodeViewDescription(
  getDOM: () => HTMLElement | null,
  getContentDOM: (
    nodeView: { contentDOM?: HTMLElement | null } | null
  ) => HTMLElement | null,
  constructor: NodeViewConstructor,
  props: Props
) {
  const { view } = useContext(EditorContext);
  const { parentRef, siblingsRef } = useContext(ChildDescriptionsContext);
  const contentDOMRef = useRef<HTMLElement | null>(null);

  // Tracks the mount layout effect's lifecycle. refUpdated must be inert
  // between that effect's cleanup and its next run: React detaches and
  // reattaches callback refs around a simulated remount (StrictMode,
  // Activity), and in that window viewDescRef still points at the
  // destroyed desc, so update() can misjudge it and register a
  // replacement that the effect's unconditional create() then orphans in
  // the parent's children, corrupting position mapping. Guarding on
  // viewDescRef alone gets the other direction wrong: a ref reattach
  // after callback ref churn (#276) finds it empty and never recreates
  // the desc. While mounted, every destroy is immediately followed by a
  // create, so viewDescRef only ever holds a live desc and update() can
  // be trusted.
  const mountedRef = useRef(false);
  const viewDescRef = useRef<NodeViewDesc | undefined>();
  const childrenRef = useRef<ViewDesc[]>([]);

  const create = useEffectEvent(() => {
    if (!(view instanceof ReactEditorView)) {
      return;
    }

    const dom = getDOM();
    if (!dom) {
      return;
    }

    const { node, getPos, decorations, innerDecorations } = props;
    const nodeView = constructor(
      node,
      view,
      getPos,
      decorations,
      innerDecorations
    );
    if (!nodeView) {
      return;
    }

    const parent = parentRef.current;
    const children = childrenRef.current;

    const contentDOM = getContentDOM(nodeView);
    const nodeDOM = nodeView.dom;

    const viewDesc = new ReactNodeViewDesc(
      parent,
      children,
      getPos,
      node,
      decorations,
      innerDecorations,
      dom,
      contentDOM,
      nodeDOM,
      nodeView
    );

    for (const child of children) {
      child.parent = viewDesc;
    }

    const siblings = siblingsRef.current;

    if (!siblings.includes(viewDesc)) {
      siblings.push(viewDesc);
    }
    siblings.sort(sortViewDescs);

    contentDOMRef.current = getContentDOM(nodeView);

    return viewDesc;
  });

  const update = useEffectEvent(() => {
    if (!(view instanceof ReactEditorView)) {
      return false;
    }

    const viewDesc = viewDescRef.current;
    if (!viewDesc) {
      return false;
    }

    const dom = getDOM();
    if (!dom || dom !== viewDesc.dom) {
      return false;
    }

    const contentDOM = getContentDOM(viewDesc);
    if (contentDOM !== viewDesc.contentDOM) {
      return false;
    }

    if (!dom.contains(viewDesc.nodeDOM)) {
      return false;
    }

    const { node, decorations, innerDecorations } = props;
    return (
      viewDesc.matchesNode(node, decorations, innerDecorations) ||
      viewDesc.update(node, decorations, innerDecorations, view)
    );
  });

  const destroy = useEffectEvent(() => {
    const viewDesc = viewDescRef.current;
    if (!viewDesc) {
      return;
    }

    viewDesc.destroy();

    const siblings = siblingsRef.current;

    if (siblings.includes(viewDesc)) {
      const index = siblings.indexOf(viewDesc);
      siblings.splice(index, 1);
    }

    contentDOMRef.current = null;
  });

  useClientLayoutEffect(() => {
    mountedRef.current = true;
    viewDescRef.current = create();
    return () => {
      mountedRef.current = false;
      destroy();
    };
  }, [create, destroy]);

  // React detaches a replaced callback ref by calling it with null
  // before attaching its successor, so while mounted a null DOM here is
  // transient: the attach pass that follows re-syncs the desc, and a
  // real unmount destroys it in the layout effect cleanup. Tearing the
  // desc down on the detach pass would destroy and recreate it even
  // though the DOM never changed.
  const domDetached = useEffectEvent(() => getDOM() == null);

  const refUpdated = useCallback(() => {
    if (!mountedRef.current) return;
    if (domDetached()) return;
    if (!update()) {
      destroy();
      viewDescRef.current = create();
    }
  }, [create, destroy, domDetached, update]);

  useClientLayoutEffect(() => {
    if (!update()) {
      destroy();
      viewDescRef.current = create();
    }

    const viewDesc = viewDescRef.current;
    if (!viewDesc) {
      return;
    }

    if (view.dom === viewDesc.dom && view instanceof ReactEditorView) {
      view.docView = viewDesc;
    }

    const parent = parentRef.current;
    const siblings = siblingsRef.current;
    const children = childrenRef.current;

    viewDesc.parent = parent;

    if (!siblings.includes(viewDesc)) {
      siblings.push(viewDesc);
    }

    // In strict/concurrent mode, a node can sometimes re-render
    // entirely on its own, without even its parent re-rendering.
    // In this case, we will have added our view descriptions to
    // our parent's children, but our parent has no opportunity
    // to sort its children, because it never renders. So
    // we always sort our siblings, too.
    siblings.sort(sortViewDescs);

    // If a child updates, usually it will re-render and sort
    // our children for us. But it's possible to reorder
    // child nodes without changing their keys or node
    // instances, in which case our children _won't_
    // rerender. As a fallback, we do one last pass through
    // our own child view descriptions and make sure
    // they're ordered. This should be a cheap no-op in most cases.
    children.sort(sortViewDescs);

    for (const child of children) {
      child.parent = viewDesc;
    }
  });

  const childContextValue = useMemo(
    () => ({
      parentRef: viewDescRef,
      siblingsRef: childrenRef,
    }),
    []
  );

  return {
    childContextValue,
    contentDOM: contentDOMRef.current,
    refUpdated,
  };
}
