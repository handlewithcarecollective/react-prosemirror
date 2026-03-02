import { EditorState } from "prosemirror-state";
import { createContext } from "react";

export interface EditorStateStore {
  getState: () => EditorState;
  subscribe: (listener: () => void) => () => void;
  setState: (state: EditorState) => void;
  notifyListeners: () => void;
}

export function createEditorStateStore(): EditorStateStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let state: EditorState = null as any;
  let pendingNotify = false;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setState: (newState) => {
      if (state !== newState) {
        state = newState;
        pendingNotify = true;
      }
    },
    notifyListeners: () => {
      if (pendingNotify) {
        pendingNotify = false;
        listeners.forEach((l) => l());
      }
    },
  };
}

export const EditorStateStoreContext = createContext<EditorStateStore>(
  null as unknown as EditorStateStore
);
