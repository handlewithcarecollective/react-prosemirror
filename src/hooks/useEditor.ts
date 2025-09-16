import { EditorState, Plugin, Transaction } from "prosemirror-state";
import { Decoration, EditorProps, EditorView } from "prosemirror-view";
import { useCallback, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { AbstractEditorView } from "../AbstractEditorView.js";
import { ReactEditorView } from "../ReactEditorView.js";
import { StaticEditorView } from "../StaticEditorView.js";
import { EMPTY_STATE } from "../constants.js";
import { beforeInputPlugin } from "../plugins/beforeInputPlugin.js";

import { useClientLayoutEffect } from "./useClientLayoutEffect.js";
import { useComponentEventListeners } from "./useComponentEventListeners.js";
import { useForceUpdate } from "./useForceUpdate.js";

export interface UseEditorOptions extends EditorProps {
  defaultState?: EditorState;
  state?: EditorState;
  plugins?: readonly Plugin[];
  dispatchTransaction?(this: EditorView, tr: Transaction): void;
}

let didWarnValueDefaultValue = false;

/**
 * Creates, mounts, and manages a ProseMirror `EditorView`.
 *
 * All state and props updates are executed in a layout effect.
 * To ensure that the EditorState and EditorView are never out of
 * sync, it's important that the EditorView produced by this hook
 * is only accessed through the `useEditorViewEvent` and
 * `useEditorViewLayoutEffect` hooks.
 */
export function useEditor<T extends HTMLElement = HTMLElement>(
  mount: T | null,
  options: UseEditorOptions
) {
  if (process.env.NODE_ENV !== "production") {
    if (
      options.defaultState !== undefined &&
      options.state !== undefined &&
      !didWarnValueDefaultValue
    ) {
      console.error(
        "A component contains a ProseMirror editor with both state and defaultState props. " +
          "ProseMirror editors must be either controlled or uncontrolled " +
          "(specify either the state prop, or the defaultState prop, but not both). " +
          "Decide between using a controlled or uncontrolled ProseMirror editor " +
          "and remove one of these props. More info: " +
          "https://reactjs.org/link/controlled-components"
      );
      didWarnValueDefaultValue = true;
    }
  }
  const flushSyncRef = useRef(true);
  const [cursorWrapper, _setCursorWrapper] = useState<Decoration | null>(null);
  const forceUpdate = useForceUpdate();

  const defaultState = options.defaultState ?? EMPTY_STATE;
  const [_state, setState] = useState<EditorState>(defaultState);
  const state = options.state ?? _state;

  const {
    componentEventListenersPlugin,
    registerEventListener,
    unregisterEventListener,
  } = useComponentEventListeners();

  const setCursorWrapper = useCallback((deco: Decoration | null) => {
    flushSync(() => {
      _setCursorWrapper(deco);
    });
  }, []);

  const plugins = useMemo(
    () => [
      ...(options.plugins ?? []),
      componentEventListenersPlugin,
      beforeInputPlugin(setCursorWrapper),
    ],
    [options.plugins, componentEventListenersPlugin, setCursorWrapper]
  );

  const dispatchTransaction = useCallback(
    function dispatchTransaction(this: EditorView, tr: Transaction) {
      if (flushSyncRef.current) {
        flushSync(() => {
          if (!options.state) {
            setState((s) => s.apply(tr));
          }

          if (options.dispatchTransaction) {
            options.dispatchTransaction.call(this, tr);
          }
        });
      } else {
        if (!options.state) {
          setState((s) => s.apply(tr));
        }

        if (options.dispatchTransaction) {
          options.dispatchTransaction.call(this, tr);
        }
      }
    },
    [options.dispatchTransaction, options.state]
  );

  const directEditorProps = {
    ...options,
    state,
    plugins,
    dispatchTransaction,
  };

  const [view, setView] = useState<AbstractEditorView>(() => {
    return new StaticEditorView(directEditorProps);
  });

  useClientLayoutEffect(() => {
    return () => {
      view.destroy();
    };
  }, [view]);

  // This rule is concerned about infinite updates due to the
  // call to setView. These calls are deliberately conditional,
  // so this is not a concern.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useClientLayoutEffect(() => {
    if (mount !== view.dom) {
      if (mount) {
        const view = new ReactEditorView({ mount }, directEditorProps);
        view.dom.addEventListener("compositionend", forceUpdate);
        setView(view);
      } else {
        const view = new StaticEditorView(directEditorProps);
        setView(view);
      }
    } else if (view instanceof ReactEditorView) {
      view.commitPendingEffects();
    }
  });

  view.update(directEditorProps);

  const editor = useMemo(
    () => ({
      view,
      cursorWrapper,
      flushSyncRef,
      registerEventListener,
      unregisterEventListener,
    }),
    [cursorWrapper, registerEventListener, unregisterEventListener, view]
  );

  return { editor, state };
}
