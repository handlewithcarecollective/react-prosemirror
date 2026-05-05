import { NodeViewConstructor } from "prosemirror-view";
import { useCallback, useContext, useMemo, useRef } from "react";

import { ReactEditorView } from "../ReactEditorView.js";
import { CursorWrapper } from "../components/CursorWrapper.js";
import { NodeViewComponentProps } from "../components/nodes/NodeViewComponentProps.js";
import { ChildDescriptionsContext } from "../contexts/ChildDescriptionsContext.js";
import { EditorContext } from "../contexts/EditorContext.js";
import { ReactWidgetType } from "../decorations/ReactWidgetType.js";
import { InternalDecoration } from "../decorations/internalTypes.js";
import { DOMNode } from "../dom.js";
import {
  CompositionViewDesc,
  MarkViewDesc,
  NodeViewDesc,
  ReactNodeViewDesc,
  ViewDesc,
  WidgetViewDesc,
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

    setTimeout(() => {
      // Because TextNodeViews can't locate the DOM nodes
      // for compositions, we need to override them here
      if (!viewDescRef.current?.contentDOM) return;
      const children = viewDescRef.current?.children;
      const compositionChildIndex = children.findIndex(
        (child) => child instanceof CompositionViewDesc
      );
      if (compositionChildIndex === -1) return;

      const compositionViewDesc = children[compositionChildIndex];

      if (!(compositionViewDesc instanceof CompositionViewDesc)) return;

      let compositionTopDOM: ChildNode | null = null;

      let search = children[compositionChildIndex - 1];
      while (search instanceof MarkViewDesc) {
        search = search.children[0];
      }

      if (
        search instanceof WidgetViewDesc &&
        (search.widget as InternalDecoration).type instanceof ReactWidgetType &&
        ((search.widget as InternalDecoration).type as ReactWidgetType)
          .Component === CursorWrapper
      ) {
        compositionTopDOM = search.dom.nextSibling;
      } else {
        for (const childNode of viewDescRef.current.contentDOM.childNodes) {
          if (children.every((child) => child.dom !== childNode)) {
            compositionTopDOM = childNode;
            break;
          }
        }
      }

      if (!compositionTopDOM) return;

      let textDOM = compositionTopDOM;
      while (textDOM.firstChild) {
        textDOM = textDOM.firstChild as Element | Text;
      }

      if (!textDOM || !(textDOM instanceof Text)) {
        console.error(compositionTopDOM, textDOM);
        throw new Error(
          `Started a composition but couldn't find the text node it belongs to.`
        );
      }
      compositionViewDesc.dom = compositionTopDOM;
      compositionViewDesc.textDOM = textDOM;
      compositionViewDesc.text = textDOM.data;
      compositionViewDesc.textDOM.pmViewDesc = compositionViewDesc;

      (view as ReactEditorView).input.compositionNodes.push(
        compositionViewDesc
      );
    });
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
