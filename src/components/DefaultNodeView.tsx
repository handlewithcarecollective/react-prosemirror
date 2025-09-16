import React, { forwardRef, useMemo } from "react";

import { NodeViewComponentProps } from "./NodeViewComponentProps.js";
import { OutputSpec } from "./OutputSpec.js";

export const DefaultNodeView = forwardRef<HTMLElement, NodeViewComponentProps>(
  function DefaultNodeView({ nodeProps: { node }, children, ...props }, ref) {
    const spec = useMemo(() => node.type.spec.toDOM?.(node), [node]);
    if (!spec) {
      throw new Error(`Node spec for ${node.type.name} is missing toDOM`);
    }

    return (
      <OutputSpec {...props} outputSpec={spec} ref={ref}>
        {children}
      </OutputSpec>
    );
  }
);
