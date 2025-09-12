import { Node } from "prosemirror-model";
import { Decoration, DecorationSource } from "prosemirror-view";
import React, {
  HTMLProps,
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

export interface DocNodeViewProps extends Omit<HTMLProps<HTMLElement>, "as"> {
  as?: ReactElement;
  node: Node;
  getPos: () => number;
  decorations: readonly Decoration[];
  innerDecorations: DecorationSource;
  setMount: (mount: HTMLElement | null) => void;
}

export const DocNodeView = memo(
  forwardRef<HTMLElement, DocNodeViewProps>(function DocNodeView(
    {
      as,
      node,
      getPos,
      decorations,
      innerDecorations,
      setMount,
      ...elementProps
    },
    ref
  ) {
    const innerRef = useRef<HTMLElement>(null);
    useImperativeHandle(ref, () => innerRef.current as HTMLElement);
    useImperativeHandle(setMount, () => innerRef.current as HTMLElement);

    const nodeProps = useMemo(
      () => ({
        node,
        getPos,
        decorations,
        innerDecorations,
      }),
      [node, getPos, decorations, innerDecorations]
    );

    const { childContextValue } = useNodeViewDescriptor(
      innerRef,
      () => {
        const dom = innerRef.current as HTMLElement;
        return {
          dom,
          contentDOM: dom,
          update() {
            return true;
          },
        };
      },
      nodeProps
    );

    const children = (
      <ChildDescriptorsContext.Provider value={childContextValue}>
        <ChildNodeViews
          getPos={getPos}
          node={node}
          innerDecorations={innerDecorations}
        />
      </ChildDescriptorsContext.Provider>
    );

    const props = {
      ...elementProps,
      suppressContentEditableWarning: true,
      ref: innerRef,
    } satisfies HTMLProps<HTMLElement>;

    const element = as
      ? cloneElement(as, props, children)
      : createElement("div", props, children);

    return nodeProps.decorations.reduce(wrapInDeco, element);
  })
);
