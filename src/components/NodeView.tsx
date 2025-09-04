import { Node } from "prosemirror-model";
import {
  Decoration,
  DecorationSource,
  NodeViewConstructor,
} from "prosemirror-view";
import React, { memo, useContext } from "react";

import { EditorContext } from "../contexts/EditorContext.js";

import { CustomNodeView } from "./CustomNodeView.js";
import { ReactNodeView } from "./ReactNodeView.js";

type NodeViewProps = {
  outerDeco: readonly Decoration[];
  getPos: () => number;
  node: Node;
  innerDeco: DecorationSource;
};

export const NodeView = memo(function NodeView({
  outerDeco,
  getPos,
  node,
  innerDeco,
  ...props
}: NodeViewProps) {
  const { view } = useContext(EditorContext);

  const customNodeView = view.nodeViews[node.type.name] as
    | NodeViewConstructor
    | undefined;

  if (customNodeView) {
    return (
      <CustomNodeView
        customNodeView={customNodeView}
        node={node}
        innerDeco={innerDeco}
        outerDeco={outerDeco}
        getPos={getPos}
      />
    );
  }

  return (
    <ReactNodeView
      node={node}
      innerDeco={innerDeco}
      outerDeco={outerDeco}
      getPos={getPos}
      {...props}
    />
  );
});
