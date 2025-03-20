import { Node } from "prosemirror-model";
import { NodeSelection } from "prosemirror-state";
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
import { useForceUpdate } from "../hooks/useForceUpdate.js";
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

  const nodeRef = useRef(node);
  nodeRef.current = node;
  const outerDecoRef = useRef(outerDeco);
  outerDecoRef.current = outerDeco;
  const innerDecoRef = useRef(innerDeco);
  innerDecoRef.current = innerDeco;

  const customNodeViewRootRef = useRef<HTMLDivElement | null>(null);
  const customNodeViewRef = useRef<NodeViewT | null>(null);

  const forceUpdate = useForceUpdate();

  const isOnClient = useClientOnly();

  // In Strict/Concurrent mode, layout effects can be destroyed/re-run
  // independently of renders. We need to ensure that if the
  // destructor that destroys the node view is called, we then recreate
  // the node view when the layout effect is re-run.
  useClientLayoutEffect(() => {
    if (!customNodeViewRef.current) {
      customNodeViewRef.current = customNodeView(
        nodeRef.current,
        // customNodeView will only be set if view is set, and we can only reach
        // this line if customNodeView is set
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        view!,
        getPosFunc,
        outerDecoRef.current,
        innerDecoRef.current
      );
      if (customNodeViewRef.current.stopEvent) {
        setStopEvent(
          customNodeViewRef.current.stopEvent.bind(customNodeViewRef.current)
        );
      }
      if (customNodeViewRef.current.selectNode) {
        setSelectNode(
          customNodeViewRef.current.selectNode.bind(customNodeViewRef.current),
          customNodeViewRef.current.deselectNode?.bind(
            customNodeViewRef.current
            // eslint-disable-next-line @typescript-eslint/no-empty-function
          ) ?? (() => {})
        );
      }
      if (customNodeViewRef.current.ignoreMutation) {
        setIgnoreMutation(
          customNodeViewRef.current.ignoreMutation.bind(
            customNodeViewRef.current
          )
        );
      }

      // If we've reconstructed the nodeview, then we need to
      // recreate the portal into its contentDOM, which happens
      // during the render. So we need to trigger a re-render!
      forceUpdate();
    }

    if (!customNodeViewRootRef.current) return;

    const { dom } = customNodeViewRef.current;

    if (customNodeViewRootRef.current.firstChild === dom) {
      return;
    }

    nodeDomRef.current = customNodeViewRootRef.current;
    customNodeViewRootRef.current.appendChild(dom);

    // Layout effects can run multiple times — if this effect
    // destroyed and recreated this node view, then we need to
    // resync the selectNode state
    if (
      view?.state.selection instanceof NodeSelection &&
      view.state.selection.node === nodeRef.current
    ) {
      customNodeViewRef.current.selectNode?.();
    }

    const nodeView = customNodeViewRef.current;

    return () => {
      nodeView.destroy?.();
      customNodeViewRef.current = null;
    };
    // setStopEvent, setSelectNodee, and setIgnoreMutation are all stable
    // functions and don't need to be added to the dependencies. They also
    // can't be, because they come from useNodeViewDescriptor, which
    // _has_ to be called after this hook, so that the effects run
    // in the correct order
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customNodeView, getPosFunc, view]);

  useClientLayoutEffect(() => {
    if (!customNodeView || !customNodeViewRef.current) return;

    const { destroy, update } = customNodeViewRef.current;

    const updated =
      update?.call(customNodeViewRef.current, node, outerDeco, innerDeco) ??
      true;
    if (updated) return;

    destroy?.call(customNodeViewRef.current);

    if (!customNodeViewRootRef.current) return;

    customNodeViewRef.current = customNodeView(
      nodeRef.current,
      // customNodeView will only be set if view is set, and we can only reach
      // this line if customNodeView is set
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      view!,
      getPosFunc,
      outerDecoRef.current,
      innerDecoRef.current
    );
    const { dom } = customNodeViewRef.current;
    nodeDomRef.current = customNodeViewRootRef.current;
    customNodeViewRootRef.current.appendChild(dom);
  }, [customNodeView, view, innerDeco, node, outerDeco, getPos, getPosFunc]);

  const {
    childDescriptors,
    nodeViewDescRef,
    setStopEvent,
    setSelectNode,
    setIgnoreMutation,
  } = useNodeViewDescriptor(
    node,
    getPosFunc,
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

  if (!isOnClient) return null;

  // In order to render the correct element with the correct
  // props below, we have to call the customNodeView in the
  // render function here. We only do this once, and the
  // results are stored in a ref but not actually appended
  // to the DOM until a client effect
  if (!customNodeViewRef.current) {
    customNodeViewRef.current = customNodeView(
      nodeRef.current,
      // customNodeView will only be set if view is set, and we can only reach
      // this line if customNodeView is set
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      view!,
      () => getPos.current(),
      outerDecoRef.current,
      innerDecoRef.current
    );
    if (customNodeViewRef.current.stopEvent) {
      setStopEvent(
        customNodeViewRef.current.stopEvent.bind(customNodeViewRef.current)
      );
    }
    if (customNodeViewRef.current.selectNode) {
      setSelectNode(
        customNodeViewRef.current.selectNode.bind(customNodeViewRef.current),
        customNodeViewRef.current.deselectNode?.bind(
          customNodeViewRef.current
          // eslint-disable-next-line @typescript-eslint/no-empty-function
        ) ?? (() => {})
      );
    }
    if (customNodeViewRef.current.ignoreMutation) {
      setIgnoreMutation(
        customNodeViewRef.current.ignoreMutation.bind(customNodeViewRef.current)
      );
    }
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
