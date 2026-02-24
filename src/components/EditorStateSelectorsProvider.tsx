import React, {
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import {
  EditorStateSelectorContexts,
  EditorStateSelectorsContext,
  RegisterEditorStateSelector,
} from "../contexts/EditorStateSelectorsContext.js";
import { useEditorState } from "../hooks/useEditorState.js";

interface RegistrarProps {
  children: ReactNode;
}

export function EditorStateSelectorsRegistrar({ children }: RegistrarProps) {
  const [contexts, setContexts] = useState<EditorStateSelectorContexts>(
    new Map()
  );

  const register = useCallback<RegisterEditorStateSelector>(
    (context, selector) => {
      setContexts((prev) => new Map(prev).set(context, selector));
      return () => {
        setContexts((prev) => {
          new Map(prev).delete(context);
          return prev;
        });
      };
    },
    []
  );

  const value = useMemo(
    () => ({
      contexts,
      register,
    }),
    [contexts, register]
  );

  return (
    <EditorStateSelectorsContext.Provider value={value}>
      {children}
    </EditorStateSelectorsContext.Provider>
  );
}

interface ProviderProps {
  children: JSX.Element | null;
}

export function EditorStateSelectorsProvider({ children }: ProviderProps) {
  const editorState = useEditorState();
  const { contexts: contextMap } = useContext(EditorStateSelectorsContext);
  const contexts = useMemo(() => Array.from(contextMap.keys()), [contextMap]);

  return contexts.reduce(
    (acc, Context) => (
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      <Context.Provider value={contextMap.get(Context)!(editorState)}>
        {acc}
      </Context.Provider>
    ),
    children
  );
}
