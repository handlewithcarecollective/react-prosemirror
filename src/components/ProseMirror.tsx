import React, { ComponentType, ReactNode, useMemo, useState } from "react";

import { ChildDescriptorsContext } from "../contexts/ChildDescriptorsContext.js";
import { EditorContext } from "../contexts/EditorContext.js";
import { EditorStateContext } from "../contexts/EditorStateContext.js";
import {
  NodeViewContext,
  NodeViewContextValue,
} from "../contexts/NodeViewContext.js";
import { computeDocDeco } from "../decorations/computeDocDeco.js";
import { viewDecorations } from "../decorations/viewDecorations.js";
import { UseEditorOptions, useEditor } from "../hooks/useEditor.js";

import { LayoutGroup } from "./LayoutGroup.js";
import { DocNodeViewContext } from "./ProseMirrorDoc.js";
import { MarkViewComponentProps } from "./marks/MarkViewComponentProps.js";
import { NodeViewComponentProps } from "./nodes/NodeViewComponentProps.js";

function getPos() {
  return -1;
}

const rootChildDescriptorsContextValue = {
  parentRef: { current: undefined },
  siblingsRef: {
    current: [],
  },
};

export type Props = UseEditorOptions & {
  children?: ReactNode;
  nodeViewComponents?: {
    [nodeType: string]: ComponentType<NodeViewComponentProps>;
  };
  markViewComponents?: {
    [markType: string]: ComponentType<MarkViewComponentProps>;
  };
};

function ProseMirrorInner({
  children,
  nodeViewComponents,
  markViewComponents,
  ...props
}: Props) {
  const [mount, setMount] = useState<HTMLElement | null>(null);

  const { editor, state } = useEditor(mount, props);

  const nodeViewConstructors = editor.view.nodeViews;
  const nodeViewContextValue = useMemo<NodeViewContextValue>(() => {
    return {
      components: { ...nodeViewComponents, ...markViewComponents },
      constructors: nodeViewConstructors,
    };
  }, [markViewComponents, nodeViewComponents, nodeViewConstructors]);

  const node = state.doc;
  const decorations = computeDocDeco(editor.view);
  const innerDecorations = viewDecorations(editor.view, editor.cursorWrapper);
  const docNodeViewContextValue = useMemo(
    () => ({
      setMount,
      node,
      getPos,
      decorations,
      innerDecorations,
    }),
    [node, decorations, innerDecorations]
  );

  return (
    <EditorContext.Provider value={editor}>
      <EditorStateContext.Provider value={state}>
        <NodeViewContext.Provider value={nodeViewContextValue}>
          <ChildDescriptorsContext.Provider
            value={rootChildDescriptorsContextValue}
          >
            <DocNodeViewContext.Provider value={docNodeViewContextValue}>
              {children}
            </DocNodeViewContext.Provider>
          </ChildDescriptorsContext.Provider>
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
