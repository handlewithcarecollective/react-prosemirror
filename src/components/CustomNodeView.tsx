import { Node } from "prosemirror-model";
import {
  Decoration,
  DecorationSource,
  NodeView,
  NodeViewConstructor,
} from "prosemirror-view";
import React, {
  cloneElement,
  createElement,
  memo,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { ReactEditorView } from "../ReactEditorView.js";
import { ChildDescriptorsContext } from "../contexts/ChildDescriptorsContext.js";
import { DOMNode } from "../dom.js";
import { useNodeViewDescriptor } from "../hooks/useNodeViewDescriptor.js";

import { ChildNodeViews, wrapInDeco } from "./ChildNodeViews.js";

interface Props {
  customNodeView: NodeViewConstructor;
  node: Node;
  getPos: () => number;
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
  const ref = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLElement>(null);

  const [selected, setSelected] = useState(false);

  const nodeProps = useMemo(
    () => ({
      node,
      getPos,
      decorations: outerDeco,
      innerDecorations: innerDeco,
    }),
    [node, getPos, outerDeco, innerDeco]
  );

  const { childContextValue, contentDOM } = useNodeViewDescriptor(
    ref,
    (node, view, getPos, decorations, innerDecorations) => {
      setSelected(false);

      const nodeView = customNodeView(
        node,
        view as ReactEditorView,
        getPos,
        decorations,
        innerDecorations
      );

      if (!nodeView || !nodeView.dom) {
        return {} as NodeView;
      }

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
      }

      return {
        ...nodeView,
        destroy() {
          if (nodeView.destroy) {
            nodeView.destroy();
          }

          wrapperDOM.removeChild(nodeDOM);
        },
        selectNode:
          nodeView.selectNode?.bind(nodeView) ??
          (() => {
            if (nodeDOM instanceof HTMLElement) {
              nodeDOM.classList.add("ProseMirror-selectednode");
            }

            setSelected(true);
          }),
        deselectNode:
          nodeView.deselectNode?.bind(nodeView) ??
          (() => {
            if (nodeDOM instanceof HTMLElement) {
              nodeDOM.classList.remove("ProseMirror-selectednode");
            }

            setSelected(false);
          }),
        stopEvent: nodeView.stopEvent?.bind(nodeView),
        ignoreMutation: nodeView.ignoreMutation?.bind(nodeView),
      };
    },
    nodeProps
  );

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

  const innerElement = createElement(
    node.isInline ? "span" : "div",
    { ref: innerRef },
    children
  );

  const props = {
    ...(selected || node.type.spec.draggable ? { draggable: true } : null),
    ref,
  };

  return cloneElement(outerDeco.reduce(wrapInDeco, innerElement), props);
});
