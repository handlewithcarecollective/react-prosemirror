import { EditorState } from "prosemirror-state";
import { useContext, useRef, useSyncExternalStore } from "react";

import { EditorStateStoreContext } from "../contexts/EditorStateStoreContext.js";

/**
 * Select a piece of the EditorState, a la Redux’s
 * `useSelector`.
 *
 * This hook will only trigger a re-render of the
 * consuming component if the return value of the selector
 * changes.
 */
export function useEditorStateSelector<Result>(
  selector: (state: EditorState) => Result
): Result {
  const store = useContext(EditorStateStoreContext);

  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  return useSyncExternalStore(store.subscribe, () =>
    selectorRef.current(store.getState())
  );
}
