import { DOMSerializer, Node } from "prosemirror-model";
import {
  Decoration,
  DecorationSource,
  NodeViewConstructor,
} from "prosemirror-view";
import React, { cloneElement, memo, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

import { ChildDescriptorsContext } from "../contexts/ChildDescriptorsContext.js";
import { DOMNode } from "../dom.js";
import { useNodeViewDescriptor } from "../hooks/useNodeViewDescriptor.js";

import { ChildNodeViews, wrapInDeco } from "./ChildNodeViews.js";

interface Props {
  constructor: NodeViewConstructor;
  node: Node;
  getPos: () => number;
  innerDeco: DecorationSource;
  outerDeco: readonly Decoration[];
}

export const CustomNodeView = memo(function CustomNodeView({
  constructor,
  node,
  getPos,
  innerDeco,
  outerDeco,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLSpanElement & HTMLDivElement>(null);

  const nodeProps = useMemo(
    () => ({
      node,
      getPos,
      decorations: outerDeco,
      innerDecorations: innerDeco,
    }),
    [node, getPos, outerDeco, innerDeco]
  );

  const createNodeView: NodeViewConstructor = (...args) => {
    const nodeView = constructor(...args);

    if (!nodeView || !nodeView.dom) {
      const spec = node.type.spec.toDOM?.(node);
      if (!spec) {
        throw new Error(`Node spec for ${node.type.name} is missing toDOM`);
      }

      return DOMSerializer.renderSpec(document, spec, null);
    }

    return nodeView;
  };

  const { childContextValue, contentDOM } = useNodeViewDescriptor(
    ref,
    (...args) => {
      const nodeView = createNodeView(...args);
      const contentDOM = nodeView.contentDOM;
      const nodeDOM = nodeView.dom;
      const wrapperDOM = (innerRef.current ?? ref.current) as DOMNode;
      wrapperDOM.appendChild(nodeDOM);

      if (
        !contentDOM &&
        nodeDOM instanceof HTMLElement &&
        nodeDOM.tagName !== "BR"
      ) {
        if (!nodeDOM.hasAttribute("contenteditable")) {
          nodeDOM.contentEditable = "false";
        }
        if (node.type.spec.draggable) {
          nodeDOM.draggable = true;
        }
      }

      return {
        ...nodeView,
        destroy() {
          if (nodeView.destroy) {
            nodeView.destroy();
          }

          wrapperDOM.removeChild(nodeDOM);
        },
        selectNode: nodeView.selectNode?.bind(nodeView),
        deselectNode: nodeView.deselectNode?.bind(nodeView),
        stopEvent: nodeView.stopEvent?.bind(nodeView),
        ignoreMutation: nodeView.ignoreMutation?.bind(nodeView),
      };
    },
    nodeProps
  );

  const Component = node.isInline ? "span" : "div";

  const props = { ref: innerRef };

  const children =
    !node.isLeaf && contentDOM
      ? createPortal(
          <ChildDescriptorsContext.Provider value={childContextValue}>
            <ChildNodeViews
              getPos={getPos}
              node={node}
              innerDecorations={innerDeco}
            />
          </ChildDescriptorsContext.Provider>,
          contentDOM
        )
      : null;

  return cloneElement(
    outerDeco.reduce(wrapInDeco, <Component {...props}>{children}</Component>),
    { ref }
  );
});
