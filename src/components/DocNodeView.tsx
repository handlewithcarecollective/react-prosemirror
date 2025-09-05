// TODO: I must be missing something, but I do not know why
// this linting rule is only broken in this file
/* eslint-disable react/prop-types */
import { Node } from "prosemirror-model";
import { Decoration, DecorationSource } from "prosemirror-view";
import React, {
  DetailedHTMLProps,
  ForwardedRef,
  HTMLAttributes,
  ReactElement,
  cloneElement,
  createElement,
  forwardRef,
  memo,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";

import { ChildDescriptorsContext } from "../contexts/ChildDescriptorsContext.js";
import { useNodeViewDescriptor } from "../hooks/useNodeViewDescriptor.js";

import { ChildNodeViews, wrapInDeco } from "./ChildNodeViews.js";

function getPos() {
  return -1;
}

export type DocNodeViewProps = {
  className?: string;
  node: Node;
  innerDeco: DecorationSource;
  outerDeco: Decoration[];
  as?: ReactElement;
} & Omit<DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLDivElement>, "ref">;

export const DocNodeView = memo(
  forwardRef(function DocNodeView(
    {
      className,
      node,
      innerDeco,
      outerDeco,
      as,
      ...elementProps
    }: DocNodeViewProps,
    ref: ForwardedRef<HTMLDivElement | null>
  ) {
    const innerRef = useRef<HTMLDivElement | null>(null);

    useImperativeHandle<HTMLDivElement | null, HTMLDivElement | null>(
      ref,
      () => {
        return innerRef.current;
      },
      []
    );

    const { childDescriptors, nodeViewDescRef } = useNodeViewDescriptor(
      node,
      getPos,
      innerRef,
      innerRef,
      innerDeco,
      outerDeco,
      innerRef
    );

    const childContextValue = useMemo(
      () => ({
        parentRef: nodeViewDescRef,
        siblingsRef: childDescriptors,
      }),
      [childDescriptors, nodeViewDescRef]
    );

    const props = {
      ...elementProps,
      ref: innerRef,
      className,
      suppressContentEditableWarning: true,
    };

    const element = as
      ? cloneElement(
          as,
          props,
          <ChildDescriptorsContext.Provider value={childContextValue}>
            <ChildNodeViews
              getPos={getPos}
              node={node}
              innerDecorations={innerDeco}
            />
          </ChildDescriptorsContext.Provider>
        )
      : createElement(
          "div",
          props,
          <ChildDescriptorsContext.Provider value={childContextValue}>
            <ChildNodeViews
              getPos={getPos}
              node={node}
              innerDecorations={innerDeco}
            />
          </ChildDescriptorsContext.Provider>
        );

    return outerDeco.reduce(wrapInDeco, element);
  })
);
