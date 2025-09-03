import { EditorState } from "prosemirror-state";
import {
  DirectEditorProps,
  EditorProps,
  MarkViewConstructor,
  NodeViewConstructor,
} from "prosemirror-view";

import { DOMSelection } from "./dom.js";

export type NodeViewSet = {
  [name: string]: NodeViewConstructor | MarkViewConstructor;
};

export interface AbstractEditorView {
  readonly composing: boolean;
  readonly dom: HTMLElement | null;
  readonly editable: boolean;
  readonly nodeViews: NodeViewSet;
  readonly props: DirectEditorProps;
  readonly state: EditorState;
  setProps(props: Partial<DirectEditorProps>): void;
  update(props: DirectEditorProps): void;
  updateState(state: EditorState): void;
  someProp<PropName extends keyof EditorProps>(
    propName: PropName
  ): EditorProps[PropName] | undefined;
  someProp<PropName extends keyof EditorProps, Result>(
    propName: PropName,
    f: (value: NonNullable<EditorProps[PropName]>) => Result
  ): Result | undefined;
  destroy(): void;
  domSelectionRange(): {
    anchorNode: Node | null;
    anchorOffset: number;
    focusNode: Node | null;
    focusOffset: number;
  };
  domSelection(): DOMSelection | null;
}
