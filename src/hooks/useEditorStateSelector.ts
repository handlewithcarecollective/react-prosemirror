import { EditorState } from "prosemirror-state";
import { useContext, useRef, useSyncExternalStore } from "react";

import { EditorStateStoreContext } from "../contexts/EditorStateStoreContext.js";

export function useEditorStateSelector<Result>(
  selector: (state: EditorState) => Result
): Result {
  const store = useContext(EditorStateStoreContext);

  // Keep a ref to always call the latest selector. Updating a ref during
  // render is safe: it's idempotent and not observable by React.
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  return useSyncExternalStore(
    store.subscribe,
    () => selectorRef.current(store.getState())
  );
}
