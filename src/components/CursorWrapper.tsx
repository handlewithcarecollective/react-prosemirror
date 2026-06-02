import React, { forwardRef, useImperativeHandle, useRef } from "react";

import { ReactEditorView } from "../ReactEditorView.js";
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
    if (!(view instanceof ReactEditorView) || !innerRef.current) return;

    view.domObserver.disconnectSelection();
    const domSel = view.domSelection() as Selection;
    if (!domSel.isCollapsed) return;
    const node = innerRef.current;

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    domSel.collapse(node.parentNode!, domIndex(node) + 1);

    view.cursorWrapped = true;

    view.domObserver.connectSelection();

    return () => {
      view.cursorWrapped = false;
    };
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
