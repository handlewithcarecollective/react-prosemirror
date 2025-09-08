import { EditorState } from "prosemirror-state";
import {
  Decoration,
  DirectEditorProps,
  EditorProps,
  EditorView,
} from "prosemirror-view";

import { AbstractEditorView, NodeViewSet } from "./AbstractEditorView.js";
import { EMPTY_STATE } from "./constants.js";
import { DOMNode, DOMSelection, DOMSelectionRange } from "./dom.js";
import { NodeViewDesc, ViewDesc } from "./viewdesc.js";

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

interface DOMObserver {
  observer: MutationObserver | null;
  queue: MutationRecord[];
  start(): void;
  stop(): void;
}

interface InputState {
  compositionID: number;
  compositionNodes: ViewDesc[];
  compositionPendingChanges: number;
  lastFocus: number;
  lastClick: {
    time: number;
    x: number;
    y: number;
    type: string;
    button: number;
  };
  lastSelectionOrigin: string | null;
  lastSelectionTime: number;
  lastTouch: number;
  mouseDown: {
    allowDefault: boolean;
    delayedSelectionSync: boolean;
  };
  hideSelectionGuard: (() => void) | null;
  lastIOSEnter: number;
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
export class ReactEditorView extends EditorView implements AbstractEditorView {
  declare cursorWrapper: { dom: DOMNode; deco: Decoration } | null;

  declare nodeViews: NodeViewSet;

  declare lastSelectedViewDesc: ViewDesc | undefined;

  declare docView: NodeViewDesc;

  declare input: InputState;

  declare domObserver: DOMObserver;

  declare domSelectionRange: () => DOMSelectionRange;

  declare domSelection: () => DOMSelection | null;

  private nextProps: DirectEditorProps;

  private prevState: EditorState;

  constructor(place: { mount: HTMLElement }, props: DirectEditorProps) {
    // By the time the editor view mounts this should exist.
    // We assume it is not possible to set the mount point otherwise.
    const docView = place.mount.pmViewDesc as NodeViewDesc;

    // Prevent the base class from destroying the React-managed nodes.
    // Restore them below after invoking the base class constructor.
    const reactContent = [...place.mount.childNodes];

    // Prevent the base class from mutating the React-managed attributes.
    // Restore them below after invoking the base class constructor.
    const reactAttrs = [...place.mount.attributes];
    for (const attr of reactAttrs) {
      place.mount.removeAttributeNode(attr);
    }

    try {
      // Call the superclass constructor with only a state and no plugins.
      // We'll set everything else ourselves and apply props during layout.
      super(place, { state: EMPTY_STATE });
      this.domObserver.stop();
      this.domObserver.observer = null;
      this.domObserver.queue = [];
    } finally {
      place.mount.replaceChildren(...reactContent);

      for (const attr of place.mount.attributes) {
        place.mount.removeAttributeNode(attr);
      }

      for (const attr of reactAttrs) {
        place.mount.setAttributeNode(attr);
      }
    }

    this.prevState = EMPTY_STATE;
    this.nextProps = props;
    this.state = props.state;
    this.nodeViews = buildNodeViews(this);
    this.docView = docView;
    this.dom.pmViewDesc = docView;
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

    this.editable = !this.someProp(
      "editable",
      (value) => value(this.state) === false
    );
  }

  updateState(state: EditorState) {
    this.setProps({ state });
  }

  someProp<PropName extends keyof EditorProps>(
    propName: PropName
  ): EditorProps[PropName] | undefined;
  someProp<PropName extends keyof EditorProps, Result>(
    propName: PropName,
    f?: (value: NonNullable<EditorProps[PropName]>) => Result
  ): Result | undefined;
  someProp<PropName extends keyof EditorProps, Result>(
    propName: PropName,
    f?: (value: NonNullable<EditorProps[PropName]>) => Result
  ) {
    if (!this.props) {
      // The base class constructor calls this method before props are set.
      return undefined;
    }

    const prop = this.props[propName];
    if (prop) {
      const result = f ? f(prop) : prop;
      if (result) {
        return result;
      }
    }

    for (const plugin of this.props.plugins ?? []) {
      const prop = plugin.props[propName];
      if (prop) {
        const result = f ? f(prop) : prop;
        if (result) {
          return result;
        }
      }
    }

    for (const plugin of this.state.plugins) {
      const prop = plugin.props[propName];
      if (prop) {
        const result = f ? f(prop) : prop;
        if (result) {
          return result;
        }
      }
    }

    return undefined;
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
  commitPendingEffects() {
    // This class tracks state eagerly but the base class does it lazily.
    // Temporarily roll it back so the base class can handle the updates.
    this.state = this.prevState;

    // Force the base class to try to update the document. React updated it, but
    // this ensures that the base class validates the DOM selection and invokes
    // node view selection callbacks.
    this.docView.markDirty(-1, -1);

    super.update(this.nextProps);

    // Store the new previous state.
    this.prevState = this.state;
  }
}
