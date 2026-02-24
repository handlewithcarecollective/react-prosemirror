import { EditorState } from "prosemirror-state";
import {
  Context,
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
} from "react";

import { EditorContext } from "../contexts/EditorContext.js";
import {
  EditorStateSelector,
  EditorStateSelectorsContext,
} from "../contexts/EditorStateSelectorsContext.js";

import { useEditorEffect } from "./useEditorEffect.js";

const UNINITIALIZED = Symbol.for(
  "@handlewithcare/react-prosemirror:useEditorStateSelector/uninitialized"
);

export function useEditorStateSelector<Result>(
  selector: EditorStateSelector<Result>
): Result {
  const { view } = useContext(EditorContext);
  const { register } = useContext(EditorStateSelectorsContext);
  const select = useStableCallback((state: EditorState) => selector(state));
  const context = useRef<Context<Result> | null>(null);
  if (!context.current) {
    context.current = createContext<Result>(UNINITIALIZED as unknown as Result);
  }
  const value = useContext(context.current);

  useLayoutEffect(() => {
    return register(context.current as Context<unknown>, select);
  }, [register, select]);

  return value === UNINITIALIZED ? selector(view.state) : value;
}

function useStableCallback<T extends unknown[], R>(
  callback: (...args: T) => R
) {
  const ref = useRef(callback);

  useEditorEffect(() => {
    ref.current = callback;
  }, [callback]);

  return useCallback((...args: T) => {
    return ref.current(...args);
  }, []);
}
