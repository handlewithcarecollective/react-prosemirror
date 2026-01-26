import { Mark } from "prosemirror-model";
import { MarkViewConstructor } from "prosemirror-view";
import React, {
  ComponentType,
  ReactNode,
  memo,
  useContext,
  useMemo,
} from "react";

import { NodeViewContext } from "../../contexts/NodeViewContext.js";

import { CustomMarkView } from "./CustomMarkView.js";
import { DefaultMarkView } from "./DefaultMarkView.js";
import { MarkViewComponentProps } from "./MarkViewComponentProps.js";
import { ReactMarkView } from "./ReactMarkView.js";

type Props = {
  mark: Mark;
  inline: boolean;
  getPos: () => number;
  children: ReactNode;
};

export const MarkView = memo(function MarkView(props: Props) {
  const { components, constructors } = useContext(NodeViewContext);

  const component = (components[props.mark.type.name] ??
    DefaultMarkView) as ComponentType<MarkViewComponentProps>;
  const constructor = constructors[props.mark.type.name] as
    | MarkViewConstructor
    | undefined;

  // Construct a wrapper component so that the mark view remounts when either
  // its component or constructor changes. A React mark view would remount
  // if its underlying component changed without this wrapper, but a custom
  // mark view otherwise uses the same React components for all custom mark views.
  const Component = useMemo(() => {
    if (constructor) {
      return function MarkView(props: Props) {
        return <CustomMarkView constructor={constructor} {...props} />;
      };
    }
    return function NodeView(props: Props) {
      return <ReactMarkView component={component} {...props} />;
    };
  }, [component, constructor]);

  return <Component {...props} />;
});
