import React, { forwardRef, useMemo } from "react";

import { OutputSpec } from "../OutputSpec.js";

import { MarkViewComponentProps } from "./MarkViewComponentProps.js";

export const DefaultMarkView = forwardRef<HTMLElement, MarkViewComponentProps>(
  function DefaultMarkView(
    { markProps: { mark, inline }, children, ...props },
    ref
  ) {
    const spec = useMemo(
      () => mark.type.spec.toDOM?.(mark, inline),
      [mark, inline]
    );
    if (!spec) {
      throw new Error(`Mark spec for ${mark.type.name} is missing toDOM`);
    }

    return (
      <OutputSpec {...props} outputSpec={spec} ref={ref} isMark>
        {children}
      </OutputSpec>
    );
  }
);
