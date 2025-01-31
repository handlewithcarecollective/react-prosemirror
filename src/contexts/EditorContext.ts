/* Copyright (c) The New York Times Company */
import type { DOMEventMap, EditorView } from "prosemirror-view";
import { MutableRefObject, createContext } from "react";

import type { EventHandler } from "../plugins/componentEventListeners";

export interface EditorContextValue {
  view: EditorView | null;
  registerEventListener<EventType extends keyof DOMEventMap>(
    eventType: EventType,
    handler: EventHandler<EventType>
  ): void;
  unregisterEventListener<EventType extends keyof DOMEventMap>(
    eventType: EventType,
    handler: EventHandler<EventType>
  ): void;
  flushSyncRef: MutableRefObject<boolean>;
}

/**
 * Provides the EditorView, as well as the current
 * EditorState. Should not be consumed directly; instead
 * see `useEditorState`, `useEditorViewEvent`, and
 * `useEditorViewLayoutEffect`.
 */
export const EditorContext = createContext(
  null as unknown as EditorContextValue
);
