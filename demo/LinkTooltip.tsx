import React, { useState } from "react";

import { useEditorEffect, useEditorState } from "../src/index.js";

import { schema } from "./schema.js";

export function LinkTooltip() {
  const [left, setLeft] = useState(0);
  const [top, setTop] = useState(0);
  const state = useEditorState();

  const linkMark = schema.marks.link.isInSet(state.selection.$anchor.marks());

  useEditorEffect(
    (view) => {
      if (!linkMark) return;
      const anchor = state.selection.anchor;
      const coords = view.coordsAtPos(anchor);
      setLeft(coords.left);
      setTop(coords.top);
    },
    [linkMark, state.selection.anchor]
  );

  if (!state.selection.empty) return null;

  if (!linkMark) return null;

  return (
    <div className="link-tooltip" style={{ left, top }}>
      Visit:{" "}
      <a href={linkMark.attrs.url} target="_blank" rel="noreferrer">
        {linkMark.attrs.url}
      </a>
    </div>
  );
}
