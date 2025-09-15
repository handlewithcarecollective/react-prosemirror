import { Node } from "prosemirror-model";
import {
  Decoration,
  DecorationSource,
  NodeViewConstructor,
} from "prosemirror-view";
import React, { memo, useContext, useMemo } from "react";

import { NodeViewContext } from "../contexts/NodeViewContext.js";

import { CustomNodeView } from "./CustomNodeView.js";
import { DefaultNodeView } from "./DefaultNodeView.js";
import { ReactNodeView } from "./ReactNodeView.js";

type Props = {
  node: Node;
  getPos: () => number;
  outerDeco: readonly Decoration[];
  innerDeco: DecorationSource;
};

export const NodeView = memo(function NodeView(props: Props) {
  const { components, constructors } = useContext(NodeViewContext);

  const component = components[props.node.type.name] ?? DefaultNodeView;
  const constructor = constructors[props.node.type.name] as
    | NodeViewConstructor
    | undefined;

  // Construct a wrapper component so that the node view remounts when either
  // its component or constructor changes. A React node view would remount if
  // its underlying component changed without this wrapper, but a custom node
  // view otherwise uses the same React components for all custom node views.
  const Component = useMemo(() => {
    if (constructor) {
      return function NodeView(props: Props) {
        return <CustomNodeView constructor={constructor} {...props} />;
      };
    } else {
      return function NodeView(props: Props) {
        return <ReactNodeView component={component} {...props} />;
      };
    }
  }, [constructor, component]);

  return <Component {...props} />;
});
