import React, { ReactNode, useContext, useLayoutEffect, useMemo } from "react";

import {
  EditorStateStore,
  EditorStateStoreContext,
  createEditorStateStore,
} from "../contexts/EditorStateStoreContext.js";
import { useEditorState } from "../hooks/useEditorState.js";

interface RegistrarProps {
  children: ReactNode;
}

export function EditorStateSelectorsRegistrar({ children }: RegistrarProps) {
  const store = useMemo<EditorStateStore>(() => createEditorStateStore(), []);

  return (
    <EditorStateStoreContext.Provider value={store}>
      {children}
    </EditorStateStoreContext.Provider>
  );
}

interface ProviderProps {
  children: JSX.Element | null;
}

export function EditorStateSelectorsProvider({ children }: ProviderProps) {
  const editorState = useEditorState();
  const store = useContext(EditorStateStoreContext);

  // Seems potentially unsafe, in an Async React context, but
  // not actually any different from view.updateState(state) in useEditor?
  store.setState(editorState);

  // This means that we get a double-render whenever the selectors update,
  // but everything is still consistent
  useLayoutEffect(() => {
    store.notifyListeners();
  }, [editorState, store]);

  return children;
}
