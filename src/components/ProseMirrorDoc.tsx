import { Node } from "prosemirror-model";
import { Decoration, DecorationSource } from "prosemirror-view";
import React, {
  HTMLProps,
  ReactElement,
  createContext,
  forwardRef,
  useContext,
} from "react";

import { DocNodeView } from "./nodes/DocNodeView.js";

interface DocNodeViewContextValue {
  node: Node;
  getPos: () => number;
  decorations: readonly Decoration[];
  innerDecorations: DecorationSource;
  setMount: (mount: HTMLElement | null) => void;
}

export const DocNodeViewContext = createContext<DocNodeViewContextValue>(
  null as unknown as DocNodeViewContextValue
);

interface Props extends Omit<HTMLProps<HTMLElement>, "as"> {
  as?: ReactElement;
}

export const ProseMirrorDoc = forwardRef<HTMLElement, Props>(
  function ProseMirrorDoc({ as, ...props }, ref) {
    const docProps = useContext(DocNodeViewContext);
    return <DocNodeView ref={ref} {...props} {...docProps} as={as} />;
  }
);
