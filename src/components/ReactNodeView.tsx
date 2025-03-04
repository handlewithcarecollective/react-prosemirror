import { DOMOutputSpec, Node } from "prosemirror-model";
import { Decoration, DecorationSource } from "prosemirror-view";
import React, {
  ForwardRefExoticComponent,
  MutableRefObject,
  RefAttributes,
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
  getPos: MutableRefObject<() => number>;
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
  const getPosFunc = useRef(() => getPos.current()).current;

  const { nodeViews } = useContext(NodeViewContext);

  let element: JSX.Element | null = null;

  const Component:
    | ForwardRefExoticComponent<
        NodeViewComponentProps & RefAttributes<HTMLElement>
      >
    | undefined = nodeViews[node.type.name];

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
    () => getPos.current(),
    domRef,
    nodeDomRef,
    innerDeco,
    outerDeco,
    undefined,
    contentDomRef
  );

  const finalProps = {
    ...props,
    ...(!hasContentDOM && {
      contentEditable: false,
    }),
  };

  const nodeProps = useMemo(
    () => ({
      node: node,
      getPos: getPosFunc,
      decorations: outerDeco,
      innerDecorations: innerDeco,
    }),
    [getPosFunc, innerDeco, node, outerDeco]
  );

  if (Component) {
    element = (
      <Component {...finalProps} ref={nodeDomRef} nodeProps={nodeProps}>
        <ChildNodeViews
          getPos={getPos}
          node={node}
          innerDecorations={innerDeco}
        />
      </Component>
    );
  } else {
    if (outputSpec) {
      element = (
        <OutputSpec {...finalProps} ref={nodeDomRef} outputSpec={outputSpec}>
          <ChildNodeViews
            getPos={getPos}
            node={node}
            innerDecorations={innerDeco}
          />
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
