import React, { useContext, useRef } from "react";

import { ChildDescriptionsContext } from "../contexts/ChildDescriptionsContext.js";
import { useClientLayoutEffect } from "../hooks/useClientLayoutEffect.js";
import { TrailingHackViewDesc, sortViewDescsCached } from "../viewdesc.js";

type Props = {
  getPos: () => number;
};

export function TrailingHackView({ getPos }: Props) {
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
    sortViewDescsCached(siblingsRef.current);
  });

  return <br ref={ref} className="ProseMirror-trailingBreak" />;
}
