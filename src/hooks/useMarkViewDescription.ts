import { MarkViewConstructor } from "prosemirror-view";
import { useCallback, useContext, useMemo, useRef } from "react";

import { ReactEditorView } from "../ReactEditorView.js";
import { MarkViewComponentProps } from "../components/marks/MarkViewComponentProps.js";
import { ChildDescriptionsContext } from "../contexts/ChildDescriptionsContext.js";
import { EditorContext } from "../contexts/EditorContext.js";
import { DOMNode } from "../dom.js";
import {
  CompositionViewDesc,
  MarkViewDesc,
  ReactMarkViewDesc,
  ViewDesc,
  sortViewDescs,
} from "../viewdesc.js";

import { useClientLayoutEffect } from "./useClientLayoutEffect.js";
import { useEffectEvent } from "./useEffectEvent.js";

type Props = Omit<MarkViewComponentProps["markProps"], "contentDOMRef">;

export function useMarkViewDescription(
  getDOM: () => DOMNode | null,
  getContentDOM: (
    markView: { contentDOM?: HTMLElement | null } | null
  ) => HTMLElement | null,
  constructor: MarkViewConstructor,
  props: Props
) {
  const { view } = useContext(EditorContext);
  const { parentRef, siblingsRef } = useContext(ChildDescriptionsContext);

  const contentDOMRef = useRef<HTMLElement | null>(null);

  const viewDescRef = useRef<MarkViewDesc | undefined>();
  const childrenRef = useRef<ViewDesc[]>([]);

  const create = useEffectEvent(() => {
    if (!(view instanceof ReactEditorView)) {
      return;
    }

    const dom = getDOM();
    if (!dom) {
      return;
    }

    const { mark, inline, getPos } = props;

    const markView = constructor(mark, view, inline);
    if (!markView) {
      return;
    }

    const parent = parentRef.current;
    const children = childrenRef.current;

    const contentDOM = getContentDOM(markView);

    const viewDesc = new ReactMarkViewDesc(
      parent,
      children,
      getPos,
      mark,
      dom,
      contentDOM ?? (markView.dom as HTMLElement),
      markView
    );

    // When create() runs after a destroy() (either here in a layout
    // effect or in refUpdated), the inherited children still reference
    // the just-destroyed desc. Re-parent them onto this fresh desc
    // before any other code can observe the stale pointer.
    for (const child of children) {
      child.parent = viewDesc;
    }

    contentDOMRef.current = contentDOM;

    return viewDesc;
  });

  const update = useEffectEvent(() => {
    if (!(view instanceof ReactEditorView)) {
      return false;
    }

    const viewDesc = viewDescRef.current;
    if (!viewDesc) {
      return false;
    }

    const dom = getDOM();
    if (!dom || dom !== viewDesc.dom) {
      return false;
    }

    const contentDOM = getContentDOM(viewDesc);
    if (contentDOM !== (viewDesc.contentDOM ?? dom)) {
      return false;
    }

    const { mark } = props;
    return viewDesc.matchesMark(mark);
  });

  const destroy = useEffectEvent(() => {
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

    contentDOMRef.current = null;
  });

  useClientLayoutEffect(() => {
    viewDescRef.current = create();
    return () => {
      destroy();
    };
  }, [create, destroy]);

  const refUpdated = useCallback(() => {
    if (!update()) {
      destroy();
      viewDescRef.current = create();
    }
  }, [create, destroy, update]);

  useClientLayoutEffect(() => {
    if (!update()) {
      destroy();
      viewDescRef.current = create();
    }

    const viewDesc = viewDescRef.current;
    if (!viewDesc) {
      return;
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
    }
  });

  const findCompositionDOM = useCallback(() => {
    const children = childrenRef.current;
    // Because TextNodeViews can't locate the DOM nodes
    // for compositions, we need to override them here
    if (!viewDescRef.current?.contentDOM) return;
    const compositionChildIndex = children.findIndex(
      (child) => child instanceof CompositionViewDesc
    );
    if (compositionChildIndex === -1) return;

    const compositionViewDesc = children[compositionChildIndex];

    if (!(compositionViewDesc instanceof CompositionViewDesc)) return;

    let compositionTopDOM: ChildNode | null = null;

    for (const childNode of viewDescRef.current.contentDOM.childNodes) {
      if (children.every((child) => child.dom !== childNode)) {
        compositionTopDOM = childNode;
        break;
      }
    }

    if (!compositionTopDOM) return;

    let textDOM = compositionTopDOM;
    while (textDOM.firstChild) {
      textDOM = textDOM.firstChild as Element | Text;
    }

    if (!textDOM || !(textDOM instanceof Text)) {
      console.error(compositionTopDOM, textDOM);
      throw new Error(
        `Started a composition but couldn't find the text node it belongs to.`
      );
    }
    compositionViewDesc.dom = compositionTopDOM;
    compositionViewDesc.textDOM = textDOM;
    compositionViewDesc.text = textDOM.data;
    compositionViewDesc.textDOM.pmViewDesc = compositionViewDesc;

    (view as ReactEditorView).input.compositionNodes.push(compositionViewDesc);
  }, [view]);

  const childContextValue = useMemo(
    () => ({
      parentRef: viewDescRef,
      siblingsRef: childrenRef,
      findCompositionDOM,
    }),
    [findCompositionDOM]
  );

  return {
    childContextValue,
    contentDOM:
      contentDOMRef.current ??
      (viewDescRef.current?.dom as HTMLElement | undefined),
    refUpdated,
  };
}
