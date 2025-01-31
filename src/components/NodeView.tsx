import { Node } from "prosemirror-model";
import { Decoration, DecorationSource } from "prosemirror-view";
import React, { MutableRefObject, memo, useContext } from "react";

import { EditorContext } from "../contexts/EditorContext.js";

import { CustomNodeView } from "./CustomNodeView.js";
import { ReactNodeView } from "./ReactNodeView.js";

type NodeViewProps = {
  outerDeco: readonly Decoration[];
  getPos: MutableRefObject<() => number>;
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

  const customNodeView = view?.someProp(
    "nodeViews",
    (nodeViews) => nodeViews?.[node.type.name]
  );

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
