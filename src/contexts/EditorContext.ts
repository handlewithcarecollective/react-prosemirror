/* Copyright (c) The New York Times Company */
import type { DOMEventMap, Decoration } from "prosemirror-view";
import { MutableRefObject, createContext } from "react";

import { AbstractEditorView } from "../AbstractEditorView.js";
import type { EventHandler } from "../plugins/componentEventListeners.js";

export interface EditorContextValue {
  view: AbstractEditorView;
  cursorWrapper: Decoration | null;
  flushSyncRef: MutableRefObject<boolean>;
  registerEventListener<EventType extends keyof DOMEventMap>(
    eventType: EventType,
    handler: EventHandler<EventType>
  ): void;
  unregisterEventListener<EventType extends keyof DOMEventMap>(
    eventType: EventType,
    handler: EventHandler<EventType>
  ): void;
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
