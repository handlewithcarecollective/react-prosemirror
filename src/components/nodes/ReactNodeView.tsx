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

import { ChildDescriptionsContext } from "../../contexts/ChildDescriptionsContext.js";
import {
  IgnoreMutation,
  IgnoreMutationContext,
} from "../../contexts/IgnoreMutationContext.js";
import {
  DeselectNode,
  SelectNode,
  SelectNodeContext,
} from "../../contexts/SelectNodeContext.js";
import {
  StopEvent,
  StopEventContext,
} from "../../contexts/StopEventContext.js";
import { DOMNode } from "../../dom.js";
import { useForceUpdate } from "../../hooks/useForceUpdate.js";
import { useGetPos } from "../../hooks/useGetPos.js";
import { useNodeViewDescription } from "../../hooks/useNodeViewDescription.js";
import { KeyInfo } from "../../keys.js";
import { ChildNodeViews, wrapInDeco } from "../ChildNodeViews.js";
import { NodeViewComponentProps } from "../nodes/NodeViewComponentProps.js";

type Props = {
  component: ComponentType<NodeViewComponentProps>;
  outerDeco: readonly Decoration[];
  keyInfo: KeyInfo;
  node: Node;
  innerDeco: DecorationSource;
};

export const ReactNodeView = memo(function ReactNodeView({
  component: Component,
  outerDeco,
  keyInfo,
  node,
  innerDeco,
}: Props) {
  const [hasCustomSelectNode, setHasCustomSelectNode] = useState(false);
  const [selected, setSelected] = useState(false);
  const forceUpdate = useForceUpdate();

  const domRef = useRef<HTMLElement | null>(null);
  const nodeDOMRef = useRef<HTMLElement | null>(null);
  const contentDOMRef = useRef<HTMLElement | null>(null);

  const selectNodeRef = useRef<SelectNode | null>(null);
  const deselectNodeRef = useRef<DeselectNode | null>(null);
  const stopEventRef = useRef<StopEvent | null>(null);
  const ignoreMutationRef = useRef<IgnoreMutation | null>(null);

  const setSelectNode = useCallback(
    (selectHandler: SelectNode, deselectHandler: DeselectNode) => {
      selectNodeRef.current = selectHandler;
      deselectNodeRef.current = deselectHandler;
      setHasCustomSelectNode(true);
      return () => {
        selectNodeRef.current = null;
        deselectNodeRef.current = null;
        setHasCustomSelectNode(false);
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

  console.log(keyInfo);
  const getPos = useGetPos(keyInfo.key);

  const nodeViewDescProps = useMemo(
    () => ({
      node: node,
      getPos: getPos,
      decorations: outerDeco,
      innerDecorations: innerDeco,
    }),
    [getPos, innerDeco, node, outerDeco]
  );

  const { childContextValue, refUpdated } = useNodeViewDescription(
    () => domRef.current,
    () => contentDOMRef.current,
    () => {
      setSelected(false);

      return {
        dom: (nodeDOMRef.current ?? domRef.current) as DOMNode,
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
    nodeViewDescProps
  );

  const setDOM = useCallback(
    (el: HTMLElement | null) => {
      domRef.current = el;
      refUpdated();
    },
    [refUpdated]
  );

  const setNodeDOM = useCallback(
    (el: HTMLElement | null) => {
      if (!!nodeDOMRef.current !== !!el) {
        // Force a re-render if the existence of nodeDOM
        // is changing, since we use its existince to set
        // some props
        forceUpdate();
      }
      nodeDOMRef.current = el;
      refUpdated();
    },
    [forceUpdate, refUpdated]
  );

  const setContentDOM = useCallback(
    (el: HTMLElement | null) => {
      if (!!contentDOMRef.current !== !!el) {
        // Force a re-render if the existence of contentDOM
        // is changing, since we use its existince to set
        // some props
        forceUpdate();
      }
      contentDOMRef.current = el;
      refUpdated();
    },
    [forceUpdate, refUpdated]
  );

  const nodeProps = useMemo(
    () => ({
      ...nodeViewDescProps,
      contentDOMRef: setContentDOM,
    }),
    [nodeViewDescProps, setContentDOM]
  );

  const props = {
    nodeProps,
    ...(!contentDOMRef.current &&
    !nodeProps.node.isText &&
    nodeDOMRef.current?.nodeName !== "BR"
      ? {
          contentEditable: false,
          suppressContentEditableWarning: true,
        }
      : null),
    ...(!hasCustomSelectNode && selected
      ? { className: "ProseMirror-selectednode" }
      : null),
    ...((!hasCustomSelectNode && selected) ||
    (!contentDOMRef.current &&
      !nodeProps.node.isText &&
      domRef.current?.nodeName !== "BR" &&
      node.type.spec.draggable)
      ? { draggable: true }
      : null),
    ref: setNodeDOM,
  } satisfies NodeViewComponentProps;

  const children = !node.isLeaf ? (
    <ChildNodeViews
      keyInfo={keyInfo}
      node={node}
      innerDecorations={innerDeco}
    />
  ) : null;

  const element = cloneElement(
    outerDeco.reduce(wrapInDeco, <Component {...props}>{children}</Component>),
    { ref: setDOM }
  );

  return (
    <SelectNodeContext.Provider value={setSelectNode}>
      <StopEventContext.Provider value={setStopEvent}>
        <IgnoreMutationContext.Provider value={setIgnoreMutation}>
          <ChildDescriptionsContext.Provider value={childContextValue}>
            {element}
          </ChildDescriptionsContext.Provider>
        </IgnoreMutationContext.Provider>
      </StopEventContext.Provider>
    </SelectNodeContext.Provider>
  );
});
