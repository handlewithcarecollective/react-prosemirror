import { Node } from "prosemirror-model";
import {
  Decoration,
  DecorationSource,
  NodeViewConstructor,
  NodeView as NodeViewT,
} from "prosemirror-view";
import React, {
  MutableRefObject,
  cloneElement,
  createElement,
  memo,
  useContext,
  useMemo,
  useRef,
} from "react";
import { createPortal } from "react-dom";

import { ChildDescriptorsContext } from "../contexts/ChildDescriptorsContext.js";
import { EditorContext } from "../contexts/EditorContext.js";
import { useClientLayoutEffect } from "../hooks/useClientLayoutEffect.js";
import { useClientOnly } from "../hooks/useClientOnly.js";
import { useNodeViewDescriptor } from "../hooks/useNodeViewDescriptor.js";

import { ChildNodeViews, wrapInDeco } from "./ChildNodeViews.js";

interface Props {
  customNodeView: NodeViewConstructor;
  node: Node;
  getPos: MutableRefObject<() => number>;
  innerDeco: DecorationSource;
  outerDeco: readonly Decoration[];
}

export const CustomNodeView = memo(function CustomNodeView({
  customNodeView,
  node,
  getPos,
  innerDeco,
  outerDeco,
}: Props) {
  const { view } = useContext(EditorContext);
  const domRef = useRef<HTMLElement | null>(null);
  const nodeDomRef = useRef<HTMLElement | null>(null);
  const contentDomRef = useRef<HTMLElement | null>(null);
  const getPosFunc = useRef(() => getPos.current()).current;

  // this is ill-conceived; should revisit
  const initialNode = useRef(node);
  const initialOuterDeco = useRef(outerDeco);
  const initialInnerDeco = useRef(innerDeco);

  const customNodeViewRootRef = useRef<HTMLDivElement | null>(null);
  const customNodeViewRef = useRef<NodeViewT | null>(null);

  const shouldRender = useClientOnly();

  useClientLayoutEffect(() => {
    if (
      !customNodeViewRef.current ||
      !customNodeViewRootRef.current ||
      !shouldRender
    )
      return;

    const { dom } = customNodeViewRef.current;
    nodeDomRef.current = customNodeViewRootRef.current;
    customNodeViewRootRef.current.appendChild(dom);
    return () => {
      customNodeViewRef.current?.destroy?.();
    };
  }, [customNodeViewRef, customNodeViewRootRef, nodeDomRef, shouldRender]);

  useClientLayoutEffect(() => {
    if (!customNodeView || !customNodeViewRef.current || !shouldRender) return;

    const { destroy, update } = customNodeViewRef.current;

    const updated =
      update?.call(customNodeViewRef.current, node, outerDeco, innerDeco) ??
      true;
    if (updated) return;

    destroy?.call(customNodeViewRef.current);

    if (!customNodeViewRootRef.current) return;

    initialNode.current = node;
    initialOuterDeco.current = outerDeco;
    initialInnerDeco.current = innerDeco;

    customNodeViewRef.current = customNodeView(
      initialNode.current,
      // customNodeView will only be set if view is set, and we can only reach
      // this line if customNodeView is set
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      view!,
      getPosFunc,
      initialOuterDeco.current,
      initialInnerDeco.current
    );
    const { dom } = customNodeViewRef.current;
    nodeDomRef.current = customNodeViewRootRef.current;
    customNodeViewRootRef.current.appendChild(dom);
  }, [
    customNodeView,
    view,
    innerDeco,
    node,
    outerDeco,
    getPos,
    customNodeViewRef,
    customNodeViewRootRef,
    initialNode,
    initialOuterDeco,
    initialInnerDeco,
    nodeDomRef,
    shouldRender,
    getPosFunc,
  ]);

  const { childDescriptors, nodeViewDescRef } = useNodeViewDescriptor(
    node,
    () => getPos.current(),
    domRef,
    nodeDomRef,
    innerDeco,
    outerDeco,
    undefined,
    contentDomRef
  );

  const childContextValue = useMemo(
    () => ({
      parentRef: nodeViewDescRef,
      siblingsRef: childDescriptors,
    }),
    [childDescriptors, nodeViewDescRef]
  );

  if (!shouldRender) return null;

  if (!customNodeViewRef.current) {
    customNodeViewRef.current = customNodeView(
      initialNode.current,
      // customNodeView will only be set if view is set, and we can only reach
      // this line if customNodeView is set
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      view!,
      () => getPos.current(),
      initialOuterDeco.current,
      initialInnerDeco.current
    );
  }
  const { contentDOM } = customNodeViewRef.current;
  contentDomRef.current = contentDOM ?? null;
  const element = createElement(
    node.isInline ? "span" : "div",
    {
      ref: customNodeViewRootRef,
      contentEditable: !!contentDOM,
      suppressContentEditableWarning: true,
    },
    contentDOM &&
      createPortal(
        <ChildNodeViews
          getPos={getPos}
          node={node}
          innerDecorations={innerDeco}
        />,
        contentDOM
      )
  );

  const decoratedElement = cloneElement(
    outerDeco.reduce(wrapInDeco, element),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    outerDeco.some((d) => (d as any).type.attrs.nodeName)
      ? { ref: domRef }
      : // If all of the node decorations were attr-only, then
        // we've already passed the domRef to the NodeView component
        // as a prop
        undefined
  );

  return (
    <ChildDescriptorsContext.Provider value={childContextValue}>
      {decoratedElement}
    </ChildDescriptorsContext.Provider>
  );
});
