import { MarkViewConstructor } from "prosemirror-view";
import { useContext, useMemo, useRef, useState } from "react";

import { ReactEditorView } from "../ReactEditorView.js";
import { MarkViewComponentProps } from "../components/marks/MarkViewComponentProps.js";
import { ChildDescriptionsContext } from "../contexts/ChildDescriptionsContext.js";
import { EditorContext } from "../contexts/EditorContext.js";
import { DOMNode } from "../dom.js";
import { MarkViewDesc, ViewDesc, sortViewDescs } from "../viewdesc.js";

import { useClientLayoutEffect } from "./useClientLayoutEffect.js";
import { useEffectEvent } from "./useEffectEvent.js";

type Props = MarkViewComponentProps["markProps"];

export function useMarkViewDescription(
  ref: { readonly current: DOMNode | null },
  constructor: MarkViewConstructor,
  getContentDOM: (
    markView: { contentDOM?: HTMLElement | null } | null
  ) => HTMLElement | null,
  props: Props
) {
  const { view } = useContext(EditorContext);
  const { parentRef, siblingsRef } = useContext(ChildDescriptionsContext);

  const [dom, setDOM] = useState<DOMNode | null>(null);
  const [contentDOM, setContentDOM] = useState<HTMLElement | null>(null);

  const viewDescRef = useRef<MarkViewDesc | undefined>();
  const childrenRef = useRef<ViewDesc[]>([]);

  const create = useEffectEvent(() => {
    if (!(view instanceof ReactEditorView)) {
      return;
    }

    const dom = ref.current;
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

    const viewDesc = new MarkViewDesc(
      parent,
      children,
      getPos,
      mark,
      dom,
      contentDOM ?? (dom as HTMLElement),
      markView
    );

    setDOM(dom);
    setContentDOM(contentDOM);

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

    const dom = ref.current;
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

    setDOM(null);
    setContentDOM(null);
  });

  useClientLayoutEffect(() => {
    viewDescRef.current = create();
    return () => {
      destroy();
    };
  }, [create, destroy]);

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
    ref,
  };
}
