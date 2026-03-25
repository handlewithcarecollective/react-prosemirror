import { Node } from "prosemirror-model";
import {
  Decoration,
  DecorationSource,
  NodeViewConstructor,
} from "prosemirror-view";
import React, {
  ComponentType,
  createContext,
  memo,
  useContext,
  useMemo,
} from "react";

import { NodeViewContext } from "../../contexts/NodeViewContext.js";
import { KeyInfo } from "../../keys.js";

import { DefaultNodeView } from "./DefaultNodeView.js";
import { NodeViewComponentProps } from "./NodeViewComponentProps.js";
import { NodeViewConstructorView } from "./NodeViewConstructorView.js";
import { ReactNodeView } from "./ReactNodeView.js";

type Props = {
  node: Node;
  keyInfo: KeyInfo;
  outerDeco: readonly Decoration[];
  innerDeco: DecorationSource;
};

export const NodeView = memo(function NodeView(props: Props) {
  const { components, constructors } = useContext(NodeViewContext);

  const component = (components[props.node.type.name] ??
    DefaultNodeView) as ComponentType<NodeViewComponentProps>;
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
        return <NodeViewConstructorView constructor={constructor} {...props} />;
      };
    } else {
      return function NodeView(props: Props) {
        return <ReactNodeView component={component} {...props} />;
      };
    }
  }, [constructor, component]);

  return (
    <ReactKeyContext.Provider value={props.keyInfo.toString()}>
      <Component {...props} />
    </ReactKeyContext.Provider>
  );
});

export const ReactKeyContext = createContext<string>(null as unknown as string);
