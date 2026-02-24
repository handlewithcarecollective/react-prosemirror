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

  // This _must_ be set during render so that child components
  // get the latest values from their selectors during render,
  // if they happen to render before store.notifyListeners()
  // is called
  store.setState(editorState);

  // This means that we get a double-render whenever the selectors update,
  // but everything is consistent during both renders.
  // Only components with new selector values will render on
  // the second render cycle
  useLayoutEffect(() => {
    store.notifyListeners();
  }, [editorState, store]);

  return children;
}
