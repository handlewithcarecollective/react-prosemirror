import React, { useCallback, useContext, useRef } from "react";

import { ChildDescriptionsContext } from "../contexts/ChildDescriptionsContext.js";
import { useClientLayoutEffect } from "../hooks/useClientLayoutEffect.js";
import { useGetPos } from "../hooks/useGetPos.js";
import { KeyInfo } from "../keys.js";
import { TrailingHackViewDesc, sortViewDescs } from "../viewdesc.js";

type Props = {
  keyInfo: KeyInfo;
};

export function TrailingHackView({ keyInfo }: Props) {
  const { siblingsRef, parentRef } = useContext(ChildDescriptionsContext);
  const viewDescRef = useRef<TrailingHackViewDesc | null>(null);

  const ref = useRef<(HTMLBRElement & HTMLImageElement) | null>(null);
  const getParentPos = useGetPos(keyInfo.parentKey);
  const getPos = useCallback(() => {
    return getParentPos() + keyInfo.offset;
  }, [getParentPos, keyInfo.offset]);

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

  return <br ref={ref} className="ProseMirror-trailingBreak" />;
}
