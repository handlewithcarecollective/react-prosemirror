import { EditorState, Plugin, Transaction } from "prosemirror-state";
import { EditorProps, EditorView } from "prosemirror-view";
import { useCallback, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { AbstractEditorView } from "../AbstractEditorView.js";
import { ReactEditorView } from "../ReactEditorView.js";
import { StaticEditorView } from "../StaticEditorView.js";
import { EMPTY_STATE } from "../constants.js";
import { beforeInputPlugin } from "../plugins/beforeInputPlugin.js";

import { useClientLayoutEffect } from "./useClientLayoutEffect.js";
import { useComponentEventListeners } from "./useComponentEventListeners.js";
import { useEffectEvent } from "./useEffectEvent.js";
import { useForceUpdate } from "./useForceUpdate.js";

export interface UseEditorOptions extends EditorProps {
  defaultState?: EditorState;
  state?: EditorState;
  plugins?: readonly Plugin[];
  dispatchTransaction?(this: EditorView, tr: Transaction): void;
  static?: boolean;
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
  const forceUpdate = useForceUpdate();

  const defaultState = options.defaultState ?? EMPTY_STATE;
  const [_state, setState] = useState<EditorState>(defaultState);
  const state = options.state ?? _state;

  const { handleDOMEvents, registerEventListener, unregisterEventListener } =
    useComponentEventListeners(options.handleDOMEvents);

  const plugins = useMemo(
    () => [...(options.plugins ?? []), beforeInputPlugin()],
    [options.plugins]
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
    handleDOMEvents,
  };

  const [view, setView] = useState<AbstractEditorView>(() => {
    return new StaticEditorView(directEditorProps);
  });

  const createEditorView = useEffectEvent((mount: T | null) => {
    if (mount && !options.static) {
      const view = new ReactEditorView({ mount }, directEditorProps);
      view.dom.addEventListener("compositionend", forceUpdate);
      return view;
    }

    return new StaticEditorView(directEditorProps);
  });

  useClientLayoutEffect(() => {
    const view = createEditorView(mount);
    setView(view);

    return () => {
      view.destroy();
    };
  }, [createEditorView, mount]);

  useClientLayoutEffect(() => {
    // Ensure that the EditorView hasn't been destroyed before
    // running effects. Running effects will reattach selection
    // change listeners if the EditorView has been destroyed.
    if (view instanceof ReactEditorView && !view.isDestroyed) {
      flushSyncRef.current = false;
      view.commitPendingEffects();
      // This is guarding against a very specific pathological
      // behavior in a ProseMirror plugin, which is unfortunately
      // implemented in the very popular y-cursor plugin.
      //
      // If a plugin dispatches a transaction in an immediately
      // scheduled task (i.e. setTimeout(..., 0)) during the update
      // lifecycle method, AND the user has changed the selection
      // while this render cycle was being committed, that
      // scheduled task will execute _exactly_ between when the
      // DOM selection updates and when the selectionchange
      // event is fired. This will cause commitPendingEffects
      // to override the pending selection change with the
      // previous state.
      //
      // However, this is only an issue because we wrap all dispatches
      // in a flushSync call, unless they run synchronously during
      // a useEditorEffect or commitPendingEffects. If the
      // scheduled dispatch is not flushSync'd, then
      // commitPendingEffects will run _after_ the selectionchange
      // event, and everything is fine.
      //
      // So we schedule the re-enabling of flushSync in our
      // own immediate task. Since it's scheduled _after_
      // commitPendingEffects runs, it's guaranteed to execute
      // after any immediate tasks scheduled during
      // commitPendingEffects. This means that we avoid the
      // possibility of an immediately scheduled task from
      // an update method running between the DOM selection update
      // and the selectionchange update.
      setTimeout(() => {
        flushSyncRef.current = true;
      }, 0);
    }
  });

  view.update(directEditorProps);

  const editor = useMemo(
    () => ({
      view,
      flushSyncRef,
      registerEventListener,
      unregisterEventListener,
      isStatic: options.static ?? false,
    }),
    [options.static, registerEventListener, unregisterEventListener, view]
  );

  return { editor, state };
}
