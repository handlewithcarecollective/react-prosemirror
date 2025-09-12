import { Node } from "prosemirror-model";
import { Decoration, DecorationSource } from "prosemirror-view";
import React, { cloneElement, memo, useContext, useMemo, useRef } from "react";

import { ChildDescriptorsContext } from "../contexts/ChildDescriptorsContext.js";
import { IgnoreMutationContext } from "../contexts/IgnoreMutationContext.js";
import { NodeViewContext } from "../contexts/NodeViewContext.js";
import { SelectNodeContext } from "../contexts/SelectNodeContext.js";
import { StopEventContext } from "../contexts/StopEventContext.js";
import { useNodeViewDescriptor } from "../hooks/useNodeViewDescriptor.js";

import { ChildNodeViews, wrapInDeco } from "./ChildNodeViews.js";
import { DefaultNodeView } from "./DefaultNodeView.js";

type Props = {
  outerDeco: readonly Decoration[];
  getPos: () => number;
  node: Node;
  innerDeco: DecorationSource;
};

export const ReactNodeView = memo(function ReactNodeView({
  outerDeco,
  getPos,
  node,
  innerDeco,
  ...props
}: Props) {
  const domRef = useRef<HTMLElement | null>(null);
  const nodeDomRef = useRef<HTMLElement | null>(null);
  const contentDomRef = useRef<HTMLElement | null>(null);

  const { nodeViews } = useContext(NodeViewContext);

  const {
    hasContentDOM,
    childDescriptors,
    setStopEvent,
    setSelectNode,
    setIgnoreMutation,
    nodeViewDescRef,
  } = useNodeViewDescriptor(
    node,
    getPos,
    domRef,
    nodeDomRef,
    innerDeco,
    outerDeco,
    contentDomRef
  );

  const finalProps = {
    ...props,
    ...(!hasContentDOM &&
      nodeDomRef.current?.tagName !== "BR" && {
        contentEditable: false,
      }),
  };

  const nodeProps = useMemo(
    () => ({
      node: node,
      getPos: getPos,
      decorations: outerDeco,
      innerDecorations: innerDeco,
    }),
    [getPos, innerDeco, node, outerDeco]
  );

  const Component = nodeViews[node.type.name] ?? DefaultNodeView;

  const children = !node.isLeaf ? (
    <ChildNodeViews getPos={getPos} node={node} innerDecorations={innerDeco} />
  ) : null;

  const element = (
    <Component {...finalProps} ref={nodeDomRef} nodeProps={nodeProps}>
      {children}
    </Component>
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

  const childContextValue = useMemo(
    () => ({
      parentRef: nodeViewDescRef,
      siblingsRef: childDescriptors,
    }),
    [childDescriptors, nodeViewDescRef]
  );

  return (
    <SelectNodeContext.Provider value={setSelectNode}>
      <StopEventContext.Provider value={setStopEvent}>
        <IgnoreMutationContext.Provider value={setIgnoreMutation}>
          <ChildDescriptorsContext.Provider value={childContextValue}>
            {decoratedElement}
          </ChildDescriptorsContext.Provider>
        </IgnoreMutationContext.Provider>
      </StopEventContext.Provider>
    </SelectNodeContext.Provider>
  );
});
