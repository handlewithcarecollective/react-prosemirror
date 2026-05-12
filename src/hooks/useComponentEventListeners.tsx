/* Copyright (c) The New York Times Company */
import type { DOMEventMap, EditorView } from "prosemirror-view";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { unstable_batchedUpdates as batch } from "react-dom";

export type EventHandler<
  EventType extends keyof DOMEventMap = keyof DOMEventMap
> = (view: EditorView, event: DOMEventMap[EventType]) => boolean | void;

export type HandleDOMEvents = Record<
  keyof DOMEventMap,
  EventHandler | undefined
>;

/**
 * Produces a plugin that can be used with ProseMirror to handle DOM
 * events at the EditorView.dom element.
 *
 * - `reactEventsPlugin` is a ProseMirror plugin for handling DOM events
 * at the EditorView.dom element. It should be passed to `useEditorView`,
 * along with any other plugins.
 *
 * - `registerEventListener` and `unregisterEventListener` should be
 * passed to `EditorContext.Provider`.
 *
 * @privateRemarks
 *
 * This hook uses a combination of mutable and immutable updates to give
 * us precise control over when we re-create the event listeners.
 *
 * The hook has a mutable reference to the set of handlers for each
 * event type, but the set of event types is static. This means that we
 * need to produce a new handleDOMEVents record whenever a new event type is
 * registered. We avoid producing a new record in any other
 * scenario to avoid the performance overhead of re-registering the event
 * listeners in the EditorView.
 *
 * To accomplish this, we shallowly clone the registry whenever a new event
 * type is registered.
 */
export function useComponentEventListeners(
  handleDOMEventsProp: HandleDOMEvents | undefined
) {
  const [registry, setRegistry] = useState(
    new Map<keyof DOMEventMap, Array<EventHandler>>()
  );

  const registerEventListener = useCallback(
    (eventType: keyof DOMEventMap, handler: EventHandler) => {
      const handlers = registry.get(eventType) ?? [];
      handlers.unshift(handler);
      if (!registry.has(eventType)) {
        registry.set(eventType, handlers);
        setRegistry(new Map(registry));
      }
    },
    [registry]
  );

  const unregisterEventListener = useCallback(
    (eventType: keyof DOMEventMap, handler: EventHandler) => {
      const handlers = registry.get(eventType);
      handlers?.splice(handlers.indexOf(handler), 1);
    },
    [registry]
  );

  useLayoutEffect(() => {
    if (!handleDOMEventsProp) return;
    for (const [eventType, handler] of Object.entries(handleDOMEventsProp)) {
      if (!handler) return;
      registerEventListener(eventType, handler);
    }

    return () => {
      for (const [eventType, handler] of Object.entries(handleDOMEventsProp)) {
        if (!handler) return;
        unregisterEventListener(eventType, handler);
      }
    };
  }, [handleDOMEventsProp, registerEventListener, unregisterEventListener]);

  const handleDOMEvents = useMemo(() => {
    const domEventHandlers: HandleDOMEvents = {};

    for (const [eventType, handlers] of registry.entries()) {
      function handleEvent(view: EditorView, event: Event) {
        for (const handler of handlers) {
          let handled = false;
          batch(() => {
            handled = !!handler(view, event);
          });
          if (handled || event.defaultPrevented) return true;
        }
        return false;
      }

      domEventHandlers[eventType] = handleEvent;
    }

    return domEventHandlers;
  }, [registry]);

  return {
    registerEventListener,
    unregisterEventListener,
    handleDOMEvents,
  };
}
