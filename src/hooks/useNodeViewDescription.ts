import { NodeViewConstructor } from "prosemirror-view";
import { useCallback, useContext, useMemo, useRef } from "react";

import { ReactEditorView } from "../ReactEditorView.js";
import { NodeViewComponentProps } from "../components/nodes/NodeViewComponentProps.js";
import { ChildDescriptionsContext } from "../contexts/ChildDescriptionsContext.js";
import { EditorContext } from "../contexts/EditorContext.js";
import { DOMNode } from "../dom.js";
import {
  CompositionViewDesc,
  NodeViewDesc,
  ReactNodeViewDesc,
  ViewDesc,
  sortViewDescs,
} from "../viewdesc.js";

import { useClientLayoutEffect } from "./useClientLayoutEffect.js";
import { useEffectEvent } from "./useEffectEvent.js";

type Props = Omit<NodeViewComponentProps["nodeProps"], "contentDOMRef">;

export function useNodeViewDescription(
  getDOM: () => DOMNode | null,
  getContentDOM: (
    nodeView: { contentDOM?: HTMLElement | null } | null
  ) => HTMLElement | null,
  constructor: NodeViewConstructor,
  props: Props
) {
  const { view } = useContext(EditorContext);
  const { parentRef, siblingsRef } = useContext(ChildDescriptionsContext);
  const contentDOMRef = useRef<HTMLElement | null>(null);

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
    viewDescRef.current = create();
    return () => {
      destroy();
    };
  }, [create, destroy]);

  const refUpdated = useCallback(() => {
    if (!viewDescRef.current) return;
    if (!update()) {
      destroy();
      viewDescRef.current = create();
    }
  }, [create, destroy, update]);

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
    siblings.sort(sortViewDescs);

    for (const child of children) {
      child.parent = viewDesc;

      // Because TextNodeViews can't locate the DOM nodes
      // for compositions, we need to override them here
      if (child instanceof CompositionViewDesc) {
        const compositionTopDOM = viewDesc?.contentDOM?.firstChild;
        if (!compositionTopDOM)
          throw new Error(
            `Started a composition but couldn't find the text node it belongs to.`
          );

        let textDOM = compositionTopDOM;
        while (textDOM.firstChild) {
          textDOM = textDOM.firstChild as Element | Text;
        }

        if (!textDOM || !(textDOM instanceof Text))
          throw new Error(
            `Started a composition but couldn't find the text node it belongs to.`
          );

        child.dom = compositionTopDOM;
        child.textDOM = textDOM;
        child.text = textDOM.data;
        child.textDOM.pmViewDesc = child;

        // It should not be possible to be in a composition because one could
        // not start between the renders that switch the view type.
        (view as ReactEditorView).input.compositionNodes.push(child);
      }
    }
  });

  const childContextValue = useMemo(
    () => ({
      parentRef: viewDescRef,
      siblingsRef: childrenRef,
    }),
    [childrenRef, viewDescRef]
  );

  return {
    childContextValue,
    contentDOM: contentDOMRef.current,
    refUpdated,
  };
}
