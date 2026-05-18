import React, { useContext, useRef, useState } from "react";

import { ReactEditorView } from "../ReactEditorView.js";
import { ChildDescriptionsContext } from "../contexts/ChildDescriptionsContext.js";
import { useClientLayoutEffect } from "../hooks/useClientLayoutEffect.js";
import { useEditorEffect } from "../hooks/useEditorEffect.js";
import { useEditorEventListener } from "../hooks/useEditorEventListener.js";
import { TrailingHackViewDesc, sortViewDescs } from "../viewdesc.js";

type Props = {
  getPos: () => number;
};

export function TrailingHackView({ getPos }: Props) {
  const [shouldRender, setShouldRender] = useState(true);
  const [shouldReinsert, setShouldReinsert] = useState(false);
  const { siblingsRef, parentRef } = useContext(ChildDescriptionsContext);
  const viewDescRef = useRef<TrailingHackViewDesc | null>(null);

  const ref = useRef<(HTMLBRElement & HTMLImageElement) | null>(null);
  const preservedRef = useRef(ref.current);
  if (ref.current) {
    preservedRef.current = ref.current;
  }

  useClientLayoutEffect(() => {
    const siblings = siblingsRef.current;
    return () => {
      if (!viewDescRef.current) return;
      if (siblings.includes(viewDescRef.current)) {
        const index = siblings.indexOf(viewDescRef.current);
        siblings.splice(index, 1);
      }
    };
  }, [siblingsRef]);

  useClientLayoutEffect(() => {
    if (!ref.current) return;

    if (!viewDescRef.current) {
      viewDescRef.current = new TrailingHackViewDesc(
        parentRef.current,
        [],
        getPos,
        ref.current,
        null
      );
    } else {
      viewDescRef.current.parent = parentRef.current;
      viewDescRef.current.dom = ref.current;
    }
    if (!siblingsRef.current.includes(viewDescRef.current)) {
      siblingsRef.current.push(viewDescRef.current);
    }
    siblingsRef.current.sort(sortViewDescs);
  });

  // At the start of a composition, the browser will automatically delete
  // the trailing hack br element. We need to unmount ourselves _before_
  // that happens, so that React doesn't try to remove the already-removed
  // br node when this component gets unmounted
  useEditorEventListener("compositionstart", (view) => {
    const { from } = view.state.selection;
    if (from === getPos()) {
      setShouldRender(false);
      setShouldReinsert(true);
    }
  });

  // Chrome and Safari will cancel/mangle the composition if the br element isn't
  // still in the DOM after the compositionstart event. We manually add it
  // back to the DOM, without React managing it, so that it can be removed
  // again by the browser when it starts the composition.
  useClientLayoutEffect(() => {
    if (!shouldReinsert) return;
    const preservedHack = preservedRef.current;
    if (!preservedHack) return;

    if (!viewDescRef.current) return;
    const { parent } = viewDescRef.current;

    if (!parent) return;

    const dom = parent.contentDOM;
    if (!dom) return;

    preservedHack.pmViewDesc = undefined;

    const index = parent.children.indexOf(viewDescRef.current);

    if (index === 0) {
      dom.appendChild(preservedHack);
    } else {
      dom.insertBefore(preservedHack, dom.childNodes.item(index));
    }

    return () => {
      try {
        dom.removeChild(preservedHack);
      } catch {
        // It may have already been removed by the browser during
        // the composition, but if we get unmounted before that happens,
        // we need to remove it ourselves
      }
    };
  }, [shouldReinsert]);

  // We need to run the same composition check when we first get mounted,
  // in case we got mounted in the same render batch as the beginning of
  // a composition
  useEditorEffect(
    (view) => {
      if (!(view instanceof ReactEditorView)) return;
      if (!view.compositionStarting) return;
      const { from } = view.state.selection;
      if (from === getPos()) {
        setShouldRender(false);
      }
    },
    [getPos]
  );

  useEditorEventListener("compositionend", () => {
    setShouldRender(true);
    setShouldReinsert(false);
  });

  if (!shouldRender) return null;

  return <br ref={ref} className="ProseMirror-trailingBreak" />;
}
