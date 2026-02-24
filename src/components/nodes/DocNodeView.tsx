import { Node } from "prosemirror-model";
import { Decoration, DecorationSource } from "prosemirror-view";
import React, {
  ElementType,
  HTMLProps,
  createElement,
  forwardRef,
  memo,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";

import { ChildDescriptionsContext } from "../../contexts/ChildDescriptionsContext.js";
import { useNodeViewDescription } from "../../hooks/useNodeViewDescription.js";
import { ChildNodeViews, wrapInDeco } from "../ChildNodeViews.js";

export interface DocNodeViewProps extends Omit<HTMLProps<HTMLElement>, "as"> {
  as?: ElementType;
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
        contentDOMRef: innerRef,
      }),
      [node, getPos, decorations, innerDecorations]
    );

    const { childContextValue } = useNodeViewDescription(
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
      () => innerRef.current,
      nodeProps
    );

    const children = (
      <ChildDescriptionsContext.Provider value={childContextValue}>
        <ChildNodeViews
          getPos={getPos}
          node={node}
          innerDecorations={innerDecorations}
        />
      </ChildDescriptionsContext.Provider>
    );

    const props = {
      ...elementProps,
      suppressContentEditableWarning: true,
      ref: innerRef,
    } satisfies HTMLProps<HTMLElement>;

    const element = as
      ? createElement(as, props, children)
      : createElement("div", props, children);

    return nodeProps.decorations.reduce(wrapInDeco, element);
  })
);
