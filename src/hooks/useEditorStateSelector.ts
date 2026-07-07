import { EditorState } from "prosemirror-state";
import { useContext, useSyncExternalStore } from "react";

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

  const getSnapshot = () => selector(store.getState());
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
