/* Copyright (c) The New York Times Company */
import type { EditorView } from "prosemirror-view";
import { useContext } from "react";
import type { DependencyList } from "react";

import { EditorContext } from "../contexts/EditorContext.js";

import type { ReactEditorView } from "./useEditor.js";
import { useLayoutGroupEffect } from "./useLayoutGroupEffect.js";

/**
 * Registers a layout effect to run after the EditorView has
 * been updated with the latest EditorState and Decorations.
 *
 * Effects can take an EditorView instance as an argument.
 * This hook should be used to execute layout effects that
 * depend on the EditorView, such as for positioning DOM
 * nodes based on ProseMirror positions.
 *
 * Layout effects registered with this hook still fire
 * synchronously after all DOM mutations, but they do so
 * _after_ the EditorView has been updated, even when the
 * EditorView lives in an ancestor component.
 */
export function useEditorEffect(
  effect: (editorView: EditorView) => void | (() => void),
  dependencies?: DependencyList
) {
  const { view, flushSyncRef } = useContext(EditorContext);

  // The rules of hooks want `effect` to be included in the
  // dependency list, but dependency issues for `effect` will
  // be caught by the linter at the call-site for
  // `useEditorViewLayoutEffect`.
  // Note: we specifically don't want to re-run the effect
  // every time it changes, because it will most likely
  // be defined inline and run on every re-render.
  useLayoutGroupEffect(
    () => {
      // @ts-expect-error We're making use of knowledge of internal attributes here
      if (view?.docView && (view as ReactEditorView).ready) {
        flushSyncRef.current = false;
        const result = effect(view);
        flushSyncRef.current = true;
        return result;
      }
    },
    // The rules of hooks want to be able to statically
    // verify the dependencies for the effect, but this will
    // have already happened at the call-site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    dependencies && [view, ...dependencies]
  );
}
