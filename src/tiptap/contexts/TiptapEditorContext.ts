import { createContext } from "react";

export interface TiptapEditorContextValue {
  isEditorInitialized: boolean;
  onEditorInitialize: () => void;
  onEditorDeinitialize: () => void;
}

export const TiptapEditorContext = createContext(
  null as unknown as TiptapEditorContextValue
);
