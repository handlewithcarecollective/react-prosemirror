import { Schema } from "prosemirror-model";
import { EditorState, Plugin, Transaction } from "prosemirror-state";
import {
  Decoration,
  DirectEditorProps,
  EditorProps,
  EditorView,
  MarkViewConstructor,
  NodeViewConstructor,
} from "prosemirror-view";
import { useCallback, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { DOMSelectionRange } from "../dom.js";

import { beforeInputPlugin } from "../plugins/beforeInputPlugin.js";
import { SelectionDOMObserver } from "../selection/SelectionDOMObserver.js";
import { NodeViewDesc } from "../viewdesc.js";

import { useClientLayoutEffect } from "./useClientLayoutEffect.js";
import { useComponentEventListeners } from "./useComponentEventListeners.js";
import { useForceUpdate } from "./useForceUpdate.js";

type NodeViewSet = {
  [name: string]: NodeViewConstructor | MarkViewConstructor;
};

const EMPTY_SCHEMA = new Schema({
  nodes: {
    doc: { content: "text*" },
    text: { inline: true },
  },
});

const EMPTY_STATE = EditorState.create({
  schema: EMPTY_SCHEMA,
});

function buildNodeViews(view: ReactEditorView) {
  const result: NodeViewSet = Object.create(null);
  function add(obj: NodeViewSet) {
    for (const prop in obj)
      if (!Object.prototype.hasOwnProperty.call(result, prop))
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        result[prop] = obj[prop]!;
  }
  view.someProp("nodeViews", add);
  view.someProp("markViews", add);
  return result;
}

function changedNodeViews(a: NodeViewSet, b: NodeViewSet) {
  let nA = 0,
    nB = 0;
  for (const prop in a) {
    if (a[prop] != b[prop]) return true;
    nA++;
  }
  for (const _ in b) nB++;
  return nA != nB;
}

/**
 * Extends EditorView to make prop and state updates pure, remove the DOM
 * Mutation Observer, and use a custom document view managed by React.
 *
 * @privateRemarks
 *
 * The implementation relies on the base class using a private member to store
 * the committed props and having a public getter that we override to return the
 * latest, uncommitted props. The base class can then be told to update when the
 * React effects are commit an update, applying the pending, uncommitted props.
 */
export class ReactEditorView extends EditorView {
  declare nodeViews: NodeViewSet;

  declare docView: NodeViewDesc;

  declare domObserver: SelectionDOMObserver;

  declare domSelectionRange: () => DOMSelectionRange;

  private nextProps: DirectEditorProps;

  private prevState: EditorState;

  constructor(place: { mount: HTMLElement }, props: DirectEditorProps) {
    // By the time the editor view mounts this should exist.
    // We assume it is not possible to set the mount point otherwise.
    const docView = place.mount.pmViewDesc as NodeViewDesc;

    // Prevent the base class from destroying the React-managed nodes.
    // Then restore them after invoking the base class constructor.
    const reactDOM = document.createDocumentFragment();
    reactDOM.replaceChildren(...place.mount.childNodes);
    try {
      // Call the superclass constructor with only a state and no plugins.
      // We'll set everything else ourselves and apply props during layout.
      super(place, { state: EMPTY_STATE });
      this.domObserver.stop();
    } finally {
      place.mount.replaceChildren(...reactDOM.childNodes);
    }

    this.prevState = EMPTY_STATE;
    this.nextProps = props;
    this.state = props.state;
    this.nodeViews = buildNodeViews(this);
    this.docView = docView;
    this.dom.pmViewDesc = docView;

    this.domObserver = new SelectionDOMObserver(this);
    this.domObserver.start();
  }

  get props() {
    return this.nextProps;
  }

  setProps(props: Partial<DirectEditorProps>) {
    this.update({ ...this.props, ...props });
  }

  update(props: DirectEditorProps) {
    const prevProps = this.nextProps;

    this.nextProps = props;
    this.state = props.state;

    if (
      prevProps.state.plugins !== props.state.plugins ||
      prevProps.plugins !== props.plugins
    ) {
      const nodeViews = buildNodeViews(this);
      if (changedNodeViews(this.nodeViews, nodeViews)) {
        this.nodeViews = nodeViews;
      }
    }
  }

  updateState(state: EditorState) {
    this.setProps({ state });
  }

  /**
   * Commit effects by appling the pending props and state.
   *
   * Ensures the DOM selection is correct and updates plugin views.
   *
   * @privateRemarks
   *
   * The correctness of this depends on the pure update function ensuring that
   * the node view set is up to date so that it does not try to redraw.
   */
  runPendingEffects() {
    // The base class updates state lazily, but we update it eagerly.
    // We need to temporarily roll back so that update can see the old state.
    this.state = this.prevState;

    super.update(this.nextProps);

    // Store the new previous state.
    this.prevState = this.state;
  }
}

export interface UseEditorOptions extends EditorProps {
  defaultState?: EditorState;
  state?: EditorState;
  plugins?: Plugin[];
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
        "A component contains a ProseMirror editor with both value and defaultValue props. " +
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

  const [view, setView] = useState<ReactEditorView | null>(null);

  useClientLayoutEffect(() => {
    return () => {
      view?.destroy();
    };
  }, [view]);

  // This rule is concerned about infinite updates due to the
  // call to setView. These calls are deliberately conditional,
  // so this is not a concern.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useClientLayoutEffect(() => {
    if (!mount) {
      setView(null);
    } else if (!view) {
      const newView = new ReactEditorView({ mount }, directEditorProps);
      setView(newView);
      newView.dom.addEventListener("compositionend", forceUpdate);
    } else if (view.dom !== mount) {
      setView(null);
    } else {
      view.runPendingEffects();
    }
  });

  view?.update(directEditorProps);

  const editor = useMemo(
    () => ({
      view: view as EditorView | null,
      registerEventListener,
      unregisterEventListener,
      cursorWrapper,
      flushSyncRef,
    }),
    [view, registerEventListener, unregisterEventListener, cursorWrapper]
  );

  return { editor, state };
}
