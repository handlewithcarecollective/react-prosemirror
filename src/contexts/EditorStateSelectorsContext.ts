import { EditorState } from "prosemirror-state";
import { Context, createContext } from "react";

export type EditorStateSelector<Result> = (editorState: EditorState) => Result;

export type RegisterEditorStateSelector = (
  context: Context<unknown>,
  selector: EditorStateSelector<unknown>
) => () => void;

export interface EditorStateSelectorsContextValue {
  contexts: EditorStateSelectorContexts;
  register: RegisterEditorStateSelector;
}

export type EditorStateSelectorContexts = Map<
  Context<unknown>,
  EditorStateSelector<unknown>
>;

export const EditorStateSelectorsContext =
  createContext<EditorStateSelectorsContextValue>(
    null as unknown as EditorStateSelectorsContextValue
  );
