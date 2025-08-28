import { NodeViewConstructor } from "prosemirror-view";
import React, { ComponentType, ReactNode, useMemo, useState } from "react";

import { EditorContext } from "../contexts/EditorContext.js";
import { EditorStateContext } from "../contexts/EditorStateContext.js";
import { NodeViewContext } from "../contexts/NodeViewContext.js";
import { computeDocDeco } from "../decorations/computeDocDeco.js";
import { viewDecorations } from "../decorations/viewDecorations.js";
import { UseEditorOptions, useEditor } from "../hooks/useEditor.js";

import { LayoutGroup } from "./LayoutGroup.js";
import { NodeViewComponentProps } from "./NodeViewComponentProps.js";
import { DocNodeViewContext } from "./ProseMirrorDoc.js";

export type Props = Omit<UseEditorOptions, "nodeViews"> & {
  className?: string;
  children?: ReactNode;
  nodeViews?: {
    [nodeType: string]: ComponentType<NodeViewComponentProps>;
  };
  customNodeViews?: {
    [nodeType: string]: NodeViewConstructor;
  };
};

function ProseMirrorInner({
  className,
  children,
  nodeViews,
  customNodeViews,
  ...props
}: Props) {
  const [mount, setMount] = useState<HTMLElement | null>(null);

  const { editor, state } = useEditor(mount, {
    ...props,
    nodeViews: customNodeViews,
  });

  const nodeViewContextValue = useMemo(
    () => ({
      nodeViews: nodeViews ?? {},
    }),
    [nodeViews]
  );

  const node = state.doc;
  const innerDeco = viewDecorations(editor.view, editor.cursorWrapper);
  const outerDeco = computeDocDeco(editor.view);
  const docNodeViewContextValue = useMemo(
    () => ({
      className,
      setMount,
      node,
      innerDeco,
      outerDeco,
    }),
    [className, node, innerDeco, outerDeco]
  );

  return (
    <EditorContext.Provider value={editor}>
      <EditorStateContext.Provider value={state}>
        <NodeViewContext.Provider value={nodeViewContextValue}>
          <DocNodeViewContext.Provider value={docNodeViewContextValue}>
            {children}
          </DocNodeViewContext.Provider>
        </NodeViewContext.Provider>
      </EditorStateContext.Provider>
    </EditorContext.Provider>
  );
}

export function ProseMirror(props: Props) {
  return (
    <LayoutGroup>
      <ProseMirrorInner {...props} />
    </LayoutGroup>
  );
}
