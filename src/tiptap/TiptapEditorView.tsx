import { Editor } from "@tiptap/core";
import { EditorContext } from "@tiptap/react";
import cx from "classnames";
import { Transaction } from "prosemirror-state";
import React, {
  ComponentType,
  ReactNode,
  useCallback,
  useMemo,
  useState,
} from "react";

import { ProseMirror } from "../components/ProseMirror.js";
import { MarkViewComponentProps } from "../components/marks/MarkViewComponentProps.js";
import { NodeViewComponentProps } from "../components/nodes/NodeViewComponentProps.js";
import { useForceUpdate } from "../hooks/useForceUpdate.js";

import { TiptapEditorContext } from "./contexts/TiptapEditorContext.js";

interface Props {
  editor: Editor;
  nodeViewComponents?: Record<string, ComponentType<NodeViewComponentProps>>;
  markViewComponents?: Record<string, ComponentType<MarkViewComponentProps>>;
  children?: ReactNode;
  static?: boolean;
}

/**
 * Render a Tiptap-compatible React ProseMirror editor.
 */
export function TiptapEditorView({
  editor,
  nodeViewComponents,
  markViewComponents,
  children,
  static: isStatic = false,
}: Props) {
  const [isEditorInitialized, setIsEditorInitialized] = useState(
    editor.isInitialized
  );

  const attributesProp = editor.options.editorProps?.attributes;

  const [attributes, setAttributes] = useState(
    typeof attributesProp === "function"
      ? attributesProp(editor.state)
      : attributesProp
  );

  const forceUpdate = useForceUpdate();
  const dispatchTransaction = useCallback(
    (tr: Transaction) => {
      // @ts-expect-error calling private method
      editor.dispatchTransaction(tr);
      if (typeof attributesProp === "function") {
        setAttributes(attributesProp(editor.state));
      }
      // Tiptap's dispatchTransaction doesn't trigger
      // a re-render, so we need to manually force
      // one to ensure that React stays in sync.
      forceUpdate();
    },
    [attributesProp, editor, forceUpdate]
  );

  const editorProps = {
    ...editor.options.editorProps,
    attributes: {
      role: "textbox",
      ...attributes,
      class: cx(attributes?.class, "tiptap"),
    },
  };

  const { nodeViews, markViews } = editor.isDestroyed
    ? { nodeViews: undefined, markViews: undefined }
    : editor.view.props;

  const contextValue = useMemo(() => ({ editor }), [editor]);

  const onEditorInitialize = useCallback(() => {
    setIsEditorInitialized(true);
  }, []);

  const onEditorDeinitialize = useCallback(() => {
    setIsEditorInitialized(false);
  }, []);

  const tiptapEditorContextValue = useMemo(
    () => ({ isEditorInitialized, onEditorInitialize, onEditorDeinitialize }),
    [isEditorInitialized, onEditorDeinitialize, onEditorInitialize]
  );

  return (
    <ProseMirror
      static={isStatic}
      {...editorProps}
      markViewComponents={markViewComponents}
      markViews={markViews}
      nodeViewComponents={nodeViewComponents}
      nodeViews={nodeViews}
      state={editor.state}
      dispatchTransaction={dispatchTransaction}
    >
      <EditorContext.Provider value={contextValue}>
        <TiptapEditorContext.Provider value={tiptapEditorContextValue}>
          {children}
        </TiptapEditorContext.Provider>
      </EditorContext.Provider>
    </ProseMirror>
  );
}
