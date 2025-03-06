import { ComponentType, createContext } from "react";

import { NodeViewComponentProps } from "../components/NodeViewComponentProps.js";

export type NodeViewContextValue = {
  nodeViews: Record<string, ComponentType<NodeViewComponentProps>>;
};

export const NodeViewContext = createContext(
  null as unknown as NodeViewContextValue
);
