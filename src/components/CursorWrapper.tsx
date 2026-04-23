import React, { forwardRef, useImperativeHandle, useRef } from "react";

import { domIndex } from "../dom.js";
import { useEditorEffect } from "../hooks/useEditorEffect.js";

import { WidgetViewComponentProps } from "./WidgetViewComponentProps.js";

export const CursorWrapper = forwardRef<
  HTMLImageElement,
  WidgetViewComponentProps
>(function CursorWrapper({ widget, getPos, ...props }, ref) {
  const innerRef = useRef<HTMLImageElement | null>(null);

  useImperativeHandle<HTMLImageElement | null, HTMLImageElement | null>(
    ref,
    () => {
      return innerRef.current;
    },
    []
  );

  useEditorEffect((view) => {
    if (!view || !innerRef.current) return;

    // @ts-expect-error Internal property - domObserver
    view.domObserver.disconnectSelection();
    // @ts-expect-error Internal property - domSelection
    const domSel = view.domSelection();
    const node = innerRef.current;
    const img = node.nodeName == "IMG";

    if (img) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      domSel.collapse(node.parentNode!, domIndex(node) + 1);
    } else {
      domSel.collapse(node, 0);
    }

    // @ts-expect-error Internal property - domObserver
    view.domObserver.connectSelection();
  }, []);

  return (
    <img
      ref={innerRef}
      className="ProseMirror-separator"
      // eslint-disable-next-line react/no-unknown-property
      mark-placeholder="true"
      alt=""
      {...props}
    />
  );
});
