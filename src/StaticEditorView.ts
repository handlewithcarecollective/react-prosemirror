import { EditorState } from "prosemirror-state";
import { DirectEditorProps, EditorProps } from "prosemirror-view";

import { AbstractEditorView, NodeViewSet } from "./AbstractEditorView.js";

export class StaticEditorView implements AbstractEditorView {
  readonly nodeViews: NodeViewSet = {};

  constructor(public props: DirectEditorProps) {}

  get composing() {
    return false;
  }

  get dom() {
    return null;
  }

  get editable() {
    return false;
  }

  get state() {
    return this.props.state;
  }

  get isDestroyed() {
    return false;
  }

  setProps(props: Partial<DirectEditorProps>) {
    return this.update({ ...this.props, ...props });
  }

  update(props: DirectEditorProps) {
    this.props = props;
  }

  updateState(state: EditorState) {
    this.setProps({ state });
  }

  someProp<PropName extends keyof EditorProps>(
    propName: PropName
  ): EditorProps[PropName] | undefined;
  someProp<PropName extends keyof EditorProps, Result>(
    this: AbstractEditorView,
    propName: PropName,
    f?: (value: NonNullable<EditorProps[PropName]>) => Result
  ) {
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

  destroy() {
    // pass
  }

  domSelectionRange() {
    return {
      anchorNode: null,
      anchorOffset: 0,
      focusNode: null,
      focusOffset: 0,
    };
  }

  domSelection() {
    return null;
  }
}
