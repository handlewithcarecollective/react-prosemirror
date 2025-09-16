import { ComponentType, createContext } from "react";

import { NodeViewSet } from "../AbstractEditorView.js";
import { NodeViewComponentProps } from "../components/NodeViewComponentProps.js";

export type NodeViewContextValue = {
  components: Record<string, ComponentType<NodeViewComponentProps>>;
  constructors: NodeViewSet;
};

export const NodeViewContext = createContext(
  null as unknown as NodeViewContextValue
);
