import { NodeViewConstructor } from "prosemirror-view";
import { useCallback, useContext, useMemo, useRef, useState } from "react";

import { ReactEditorView } from "../ReactEditorView.js";
import { NodeViewComponentProps } from "../components/NodeViewComponentProps.js";
import { ChildDescriptorsContext } from "../contexts/ChildDescriptorsContext.js";
import { EditorContext } from "../contexts/EditorContext.js";
import { DOMNode } from "../dom.js";
import {
  CompositionViewDesc,
  NodeViewDesc,
  ReactNodeViewDesc,
  ViewDesc,
  sortViewDescs,
} from "../viewdesc.js";

import { useClientLayoutEffect } from "./useClientLayoutEffect.js";

function findContentDOM(
  source: { contentDOM?: HTMLElement | null } | null,
  children: ViewDesc[]
) {
  return source?.contentDOM ?? children[0]?.dom?.parentElement ?? null;
}

type Props = NodeViewComponentProps["nodeProps"];

export function useNodeViewDescriptor(
  ref: { readonly current: DOMNode | null },
  constructor: NodeViewConstructor,
  props: Props
) {
  const { view } = useContext(EditorContext);
  const { parentRef, siblingsRef } = useContext(ChildDescriptorsContext);

  const [dom, setDOM] = useState<DOMNode | null>(null);
  const [nodeDOM, setNodeDOM] = useState<DOMNode | null>(null);
  const [contentDOM, setContentDOM] = useState<HTMLElement | null>(null);

  const viewDescRef = useRef<NodeViewDesc | undefined>();
  const childrenRef = useRef<ViewDesc[]>([]);

  const create = useCallback(
    (props: Props) => {
      if (!(view instanceof ReactEditorView)) {
        return;
      }

      const dom = ref.current;
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

      const contentDOM = findContentDOM(nodeView, children);
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

      setDOM(dom);
      setContentDOM(contentDOM);
      setNodeDOM(nodeDOM);

      return viewDesc;
    },
    [ref, parentRef, constructor, view]
  );

  const update = useCallback(
    (props: Props) => {
      if (!(view instanceof ReactEditorView)) {
        return false;
      }

      const viewDesc = viewDescRef.current;
      if (!viewDesc) {
        return false;
      }

      const dom = ref.current;
      if (!dom || dom !== viewDesc.dom) {
        return false;
      }

      const contentDOM = findContentDOM(viewDesc, viewDesc.children);
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
    },
    [ref, view]
  );

  const destroy = useCallback(() => {
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

    setDOM(null);
    setContentDOM(null);
    setNodeDOM(null);
  }, [siblingsRef]);

  useClientLayoutEffect(() => {
    if (!update(props)) {
      destroy();
      viewDescRef.current = create(props);
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
    siblings.sort(sortViewDescs);

    for (const child of children) {
      child.parent = viewDesc;

      // Because TextNodeViews can't locate the DOM nodes
      // for compositions, we need to override them here
      if (child instanceof CompositionViewDesc) {
        const compositionTopDOM = viewDesc?.contentDOM?.firstChild;
        if (!compositionTopDOM)
          throw new Error(
            `Started a composition but couldn't find the text node it belongs to.`
          );

        let textDOM = compositionTopDOM;
        while (textDOM.firstChild) {
          textDOM = textDOM.firstChild as Element | Text;
        }

        if (!textDOM || !(textDOM instanceof Text))
          throw new Error(
            `Started a composition but couldn't find the text node it belongs to.`
          );

        child.dom = compositionTopDOM;
        child.textDOM = textDOM;
        child.text = textDOM.data;
        child.textDOM.pmViewDesc = child;

        // It should not be possible to be in a composition because one could
        // not start between the renders that switch the view type.
        (view as ReactEditorView).input.compositionNodes.push(child);
      }
    }
  });

  useClientLayoutEffect(() => {
    return () => {
      destroy();
      viewDescRef.current = undefined;
    };
  }, [destroy]);

  const childContextValue = useMemo(
    () => ({
      parentRef: viewDescRef,
      siblingsRef: childrenRef,
    }),
    [childrenRef, viewDescRef]
  );

  return {
    childContextValue,
    dom,
    contentDOM,
    nodeDOM,
    ref,
  };
}
