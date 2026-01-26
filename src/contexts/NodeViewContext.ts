import { ComponentType, createContext } from "react";

import { NodeViewSet } from "../AbstractEditorView.js";
import { MarkViewComponentProps } from "../components/marks/MarkViewComponentProps.js";
import { NodeViewComponentProps } from "../components/nodes/NodeViewComponentProps.js";

export type NodeViewContextValue = {
  components: Record<
    string,
    | ComponentType<NodeViewComponentProps>
    | ComponentType<MarkViewComponentProps>
  >;
  constructors: NodeViewSet;
};

export const NodeViewContext = createContext(
  null as unknown as NodeViewContextValue
);
