import { Node } from "prosemirror-model";
import { Decoration, DecorationSource } from "prosemirror-view";
import React, {
  ComponentType,
  cloneElement,
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import { ChildDescriptorsContext } from "../contexts/ChildDescriptorsContext.js";
import {
  IgnoreMutation,
  IgnoreMutationContext,
} from "../contexts/IgnoreMutationContext.js";
import {
  DeselectNode,
  SelectNode,
  SelectNodeContext,
} from "../contexts/SelectNodeContext.js";
import { StopEvent, StopEventContext } from "../contexts/StopEventContext.js";
import { DOMNode } from "../dom.js";
import { useNodeViewDescriptor } from "../hooks/useNodeViewDescriptor.js";

import { ChildNodeViews, wrapInDeco } from "./ChildNodeViews.js";
import { NodeViewComponentProps } from "./NodeViewComponentProps.js";

type Props = {
  component: ComponentType<NodeViewComponentProps>;
  outerDeco: readonly Decoration[];
  getPos: () => number;
  node: Node;
  innerDeco: DecorationSource;
};

export const ReactNodeView = memo(function ReactNodeView({
  component: Component,
  outerDeco,
  getPos,
  node,
  innerDeco,
}: Props) {
  const [controlSelected, setControlSelected] = useState(false);
  const [selected, setSelected] = useState(false);

  const ref = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLElement>(null);

  const selectNodeRef = useRef<SelectNode | null>(null);
  const deselectNodeRef = useRef<DeselectNode | null>(null);
  const stopEventRef = useRef<StopEvent | null>(null);
  const ignoreMutationRef = useRef<IgnoreMutation | null>(null);

  const setSelectNode = useCallback(
    (selectHandler: SelectNode, deselectHandler: DeselectNode) => {
      selectNodeRef.current = selectHandler;
      deselectNodeRef.current = deselectHandler;
      setControlSelected(true);
      return () => {
        selectNodeRef.current = null;
        deselectNodeRef.current = null;
        setControlSelected(false);
      };
    },
    []
  );

  const setStopEvent = useCallback((handler: StopEvent | null) => {
    stopEventRef.current = handler;
    return () => {
      stopEventRef.current = null;
    };
  }, []);

  const setIgnoreMutation = useCallback((handler: IgnoreMutation | null) => {
    ignoreMutationRef.current = handler;
    return () => {
      ignoreMutationRef.current = null;
      return () => {
        ignoreMutationRef.current = null;
      };
    };
  }, []);

  const nodeProps = useMemo(
    () => ({
      node: node,
      getPos: getPos,
      decorations: outerDeco,
      innerDecorations: innerDeco,
    }),
    [getPos, innerDeco, node, outerDeco]
  );

  const { childContextValue, contentDOM, nodeDOM } = useNodeViewDescriptor(
    ref,
    () => {
      setSelected(false);

      return {
        dom: (innerRef.current ?? ref.current) as DOMNode,
        update() {
          return true;
        },
        multiType: true,
        selectNode() {
          const selectNode = selectNodeRef.current;
          if (selectNode) {
            selectNode();
          }

          setSelected(true);
        },
        deselectNode() {
          const deselectNode = deselectNodeRef.current;
          if (deselectNode) {
            deselectNode();
          }

          setSelected(false);
        },
        stopEvent(event) {
          const stopEvent = stopEventRef.current;
          if (stopEvent) {
            return stopEvent(event);
          }

          return false;
        },
        ignoreMutation(mutation) {
          const ignoreMutation = ignoreMutationRef.current;
          if (ignoreMutation) {
            return ignoreMutation(mutation);
          }

          return false;
        },
      };
    },
    nodeProps
  );

  const children = !node.isLeaf ? (
    <ChildNodeViews getPos={getPos} node={node} innerDecorations={innerDeco} />
  ) : null;

  const innerProps = {
    nodeProps,
    ...(!contentDOM && !nodeProps.node.isText && nodeDOM?.nodeName !== "BR"
      ? {
          contentEditable: false,
          suppressContentEditableWarning: true,
        }
      : null),
    ...(controlSelected && selected
      ? { className: "ProseMirror-selectednode" }
      : null),
    ref: innerRef,
  } satisfies NodeViewComponentProps;

  const innerElement = <Component {...innerProps}>{children}</Component>;

  const props = {
    ...((controlSelected && selected) || node.type.spec.draggable
      ? { draggable: true }
      : null),
    ref,
  };

  const decoratedElement = cloneElement(
    outerDeco.reduce(wrapInDeco, innerElement),
    props
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
