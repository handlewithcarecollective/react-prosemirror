import { Editor, TiptapEditorHTMLElement } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import React, {
  ForwardedRef,
  HTMLProps,
  ReactPortal,
  useContext,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

import { ReactEditorView } from "../ReactEditorView.js";
import { ProseMirrorDoc } from "../components/ProseMirrorDoc.js";
import { EditorContext } from "../contexts/EditorContext.js";
import { useClientLayoutEffect } from "../hooks/useClientLayoutEffect.js";

export type ContentComponent = {
  setRenderer(id: string, renderer: ReactRenderer): void;
  removeRenderer(id: string): void;
  subscribe: (callback: () => void) => () => void;
  getSnapshot: () => Record<string, ReactPortal>;
  getServerSnapshot: () => Record<string, ReactPortal>;
};

/**
 * This component renders all of the editor's registered "React renderers".
 */
const Portals: React.FC<{ contentComponent: ContentComponent }> = ({
  contentComponent,
}) => {
  const renderers = useSyncExternalStore(
    contentComponent.subscribe,
    contentComponent.getSnapshot,
    contentComponent.getServerSnapshot
  );

  return <>{Object.values(renderers)}</>;
};

export interface EditorContentProps extends HTMLProps<HTMLDivElement> {
  editor: Editor | null;
  innerRef?: ForwardedRef<HTMLDivElement | null>;
}

function getInstance(): ContentComponent {
  const subscribers = new Set<() => void>();
  let renderers: Record<string, React.ReactPortal> = {};

  return {
    /**
     * Subscribe to the editor instance's changes.
     */
    subscribe(callback: () => void) {
      subscribers.add(callback);
      return () => {
        subscribers.delete(callback);
      };
    },
    getSnapshot() {
      return renderers;
    },
    getServerSnapshot() {
      return renderers;
    },
    /**
     * Adds a new React Renderer to the editor.
     */
    setRenderer(id: string, renderer: ReactRenderer) {
      renderers = {
        ...renderers,
        [id]: createPortal(renderer.reactElement, renderer.element, id),
      };

      subscribers.forEach((subscriber) => subscriber());
    },
    /**
     * Removes a React Renderer from the editor.
     */
    removeRenderer(id: string) {
      const nextRenderers = { ...renderers };

      delete nextRenderers[id];
      renderers = nextRenderers;
      subscribers.forEach((subscriber) => subscriber());
    },
  };
}

interface Props extends Omit<HTMLProps<HTMLElement>, "as"> {
  editor: Editor;
}

export function TiptapEditorContent({ editor: editorProp, ...props }: Props) {
  const editor = editorProp as Editor & {
    contentComponent: ContentComponent | null;
  };
  const { view } = useContext(EditorContext);

  useClientLayoutEffect(() => {
    if (!(view instanceof ReactEditorView) || editor.view === view) {
      return;
    }

    // @ts-expect-error private property
    editor.editorView = view;

    editor.contentComponent = getInstance();

    // @ts-expect-error private method
    editor.injectCSS();

    const dom = view.dom as TiptapEditorHTMLElement;
    dom.editor = editor;

    setTimeout(() => {
      if (editor.isDestroyed) {
        return;
      }

      editor.commands.focus(editor.options.autofocus);
      editor.emit("create", { editor });
      editor.isInitialized = true;
    });

    return () => {
      editor.isInitialized = false;
      editor.contentComponent = null;
    };
  }, [editor, view]);

  return (
    <>
      <ProseMirrorDoc {...props} />
      {editor?.contentComponent && (
        <Portals contentComponent={editor.contentComponent} />
      )}
    </>
  );
}
