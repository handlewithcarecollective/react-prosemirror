import React, { useContext, useRef, useState } from "react";

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
  const { siblingsRef, parentRef } = useContext(ChildDescriptionsContext);
  const viewDescRef = useRef<TrailingHackViewDesc | null>(null);

  const ref = useRef<(HTMLBRElement & HTMLImageElement) | null>(null);

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
    }
  });

  // We need to run the same composition check when we first get mounted,
  // in case we got mounted in the same render batch as the beginning of
  // a composition
  useEditorEffect(
    (view) => {
      if (!view.composing) return;
      const { from } = view.state.selection;
      if (from === getPos()) {
        setShouldRender(false);
      }
    },
    [getPos]
  );

  useEditorEventListener("compositionend", () => {
    setShouldRender(true);
  });

  if (!shouldRender) return null;

  return <br ref={ref} className="ProseMirror-trailingBreak" />;
}
