import { Editor } from "@tiptap/core";
import { Transaction } from "prosemirror-state";
import React, { ComponentType, ReactNode, useCallback } from "react";

import { NodeViewComponentProps } from "../components/NodeViewComponentProps.js";
import { ProseMirror } from "../components/ProseMirror.js";
import { useForceUpdate } from "../hooks/useForceUpdate.js";

interface Props {
  editor: Editor;
  nodeViews?: Record<string, ComponentType<NodeViewComponentProps>>;
  children?: ReactNode;
}

/**
 * Render a Tiptap-compatible React ProseMirror editor.
 */
export function TiptapEditorView({ editor, nodeViews, children }: Props) {
  const forceUpdate = useForceUpdate();
  const dispatchTransaction = useCallback(
    (tr: Transaction) => {
      // @ts-expect-error calling private method
      editor.dispatchTransaction(tr);
      // Tiptap's dispatchTransaction doesn't trigger
      // a re-render, so we need to manually force
      // one to ensure that React stays in sync.
      forceUpdate();
    },
    [editor, forceUpdate]
  );

  const initialEditorProps = {
    ...editor.options.editorProps,
    attributes: {
      role: "textbox",
      ...editor.options.editorProps?.attributes,
    },
  };

  const { nodeViews: customNodeViews, markViews } = editor.isDestroyed
    ? { nodeViews: undefined, markViews: undefined }
    : editor.view.props;

  return (
    <ProseMirror
      className="tiptap"
      {...initialEditorProps}
      markViews={markViews}
      nodeViews={nodeViews}
      customNodeViews={customNodeViews}
      state={
        editor.isDestroyed || editor.state.plugins.length
          ? editor.state
          : editor.state.reconfigure({
              plugins: editor.extensionManager.plugins,
            })
      }
      dispatchTransaction={dispatchTransaction}
    >
      {children}
    </ProseMirror>
  );
}
