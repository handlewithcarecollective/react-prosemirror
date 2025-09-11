import { DOMOutputSpec, Node } from "prosemirror-model";
import { Decoration, DecorationSource } from "prosemirror-view";
import React, {
  ComponentType,
  cloneElement,
  memo,
  useContext,
  useMemo,
  useRef,
} from "react";

import { ChildDescriptorsContext } from "../contexts/ChildDescriptorsContext.js";
import { IgnoreMutationContext } from "../contexts/IgnoreMutationContext.js";
import { NodeViewContext } from "../contexts/NodeViewContext.js";
import { SelectNodeContext } from "../contexts/SelectNodeContext.js";
import { StopEventContext } from "../contexts/StopEventContext.js";
import { useNodeViewDescriptor } from "../hooks/useNodeViewDescriptor.js";

import { ChildNodeViews, wrapInDeco } from "./ChildNodeViews.js";
import { NodeViewComponentProps } from "./NodeViewComponentProps.js";
import { OutputSpec } from "./OutputSpec.js";

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

  let element: JSX.Element | null = null;

  const Component: ComponentType<NodeViewComponentProps> | undefined =
    nodeViews[node.type.name];

  const outputSpec: DOMOutputSpec | undefined = useMemo(
    () => node.type.spec.toDOM?.(node),
    [node]
  );

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

  const children = !node.isLeaf ? (
    <ChildNodeViews getPos={getPos} node={node} innerDecorations={innerDeco} />
  ) : null;

  if (Component) {
    element = (
      <Component {...finalProps} ref={nodeDomRef} nodeProps={nodeProps}>
        {children}
      </Component>
    );
  } else {
    if (outputSpec) {
      element = (
        <OutputSpec {...finalProps} ref={nodeDomRef} outputSpec={outputSpec}>
          {children}
        </OutputSpec>
      );
    }
  }

  if (!element) {
    throw new Error(`Node spec for ${node.type.name} is missing toDOM`);
  }

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
