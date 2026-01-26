import { Node } from "prosemirror-model";
import { Decoration, DecorationSource } from "prosemirror-view";
import { AllHTMLAttributes, LegacyRef } from "react";

export interface NodeViewComponentProps extends AllHTMLAttributes<HTMLElement> {
  nodeProps: {
    decorations: readonly Decoration[];
    innerDecorations: DecorationSource;
    node: Node;
    getPos: () => number;
  };
  // It's not really feasible to correctly type a Ref constraint,
  // because it needs to be both covariant and contravariant (because
  // it could be either a RefObject or a RefCallback). So we use any,
  // here, instead of a more useful type like HTMLElement | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ref: LegacyRef<any>;
}
