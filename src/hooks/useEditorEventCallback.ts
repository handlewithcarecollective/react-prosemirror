/* Copyright (c) The New York Times Company */
import type { EditorView } from "prosemirror-view";
import { useCallback, useContext, useRef } from "react";

import { AbstractEditorView } from "../AbstractEditorView.js";
import { ReactEditorView } from "../ReactEditorView.js";
import { EditorContext } from "../contexts/EditorContext.js";

import { useEditorEffect } from "./useEditorEffect.js";

function assertIsReactEditorView(
  view: AbstractEditorView
): asserts view is ReactEditorView {
  if (view instanceof ReactEditorView) {
    return;
  }

  throw new DOMException(
    "ProseMirror document is not mounted",
    "InvalidStateError"
  );
}

/**
 * Returns a stable function reference to be used as an
 * event handler callback.
 *
 * The callback will be called with the EditorView instance
 * as its first argument.
 *
 * This hook is dependent on both the
 * `EditorViewContext.Provider` and the
 * `DeferredLayoutEffectProvider`. It can only be used in a
 * component that is mounted as a child of both of these
 * providers.
 */
export function useEditorEventCallback<T extends unknown[], R>(
  callback: (view: EditorView, ...args: T) => R
) {
  const ref = useRef(callback);
  const { view } = useContext(EditorContext);

  useEditorEffect(() => {
    ref.current = callback;
  }, [callback]);

  return useCallback(
    (...args: T) => {
      assertIsReactEditorView(view);
      return ref.current(view, ...args);
    },
    [view]
  );
}
