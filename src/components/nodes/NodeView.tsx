import { Node } from "prosemirror-model";
import {
  Decoration,
  DecorationSource,
  NodeViewConstructor,
} from "prosemirror-view";
import React, {
  ComponentType,
  createContext,
  memo,
  useContext,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";

import { CompositionContext } from "../../contexts/CompositionContext.js";
import { NodeViewContext } from "../../contexts/NodeViewContext.js";

import { DefaultNodeView } from "./DefaultNodeView.js";
import { NodeViewComponentProps } from "./NodeViewComponentProps.js";
import { NodeViewConstructorView } from "./NodeViewConstructorView.js";
import { ReactNodeView } from "./ReactNodeView.js";

type Props = {
  node: Node;
  getPos: () => number;
  outerDeco: readonly Decoration[];
  innerDeco: DecorationSource;
  forceRemount: () => void;
};

export const NodeView = memo(function NodeView({
  forceRemount,
  ...props
}: Props) {
  const renderRef = useRef<JSX.Element | null>(null);
  const { freezeFrom } = useContext(CompositionContext);
  const { components, constructors } = useContext(NodeViewContext);

  const committedFrozenRef = useRef(false);

  const component = (components[props.node.type.name] ??
    DefaultNodeView) as ComponentType<NodeViewComponentProps>;
  const constructor = constructors[props.node.type.name] as
    | NodeViewConstructor
    | undefined;

  // Construct a wrapper component so that the node view remounts when either
  // its component or constructor changes. A React node view would remount if
  // its underlying component changed without this wrapper, but a custom node
  // view otherwise uses the same React components for all custom node views.
  const Component = useMemo(() => {
    if (constructor) {
      return function NodeView(props: Omit<Props, "forceRemount">) {
        return <NodeViewConstructorView constructor={constructor} {...props} />;
      };
    } else {
      return function NodeView(props: Omit<Props, "forceRemount">) {
        return <ReactNodeView component={component} {...props} />;
      };
    }
  }, [constructor, component]);

  // It's not generally safe to access getPos during render, because the
  // component may not re-render when its return value would change. Here it's
  // safe because we only use it to _suppress_ commits that would otherwise
  // have happened.
  const frozen = props.getPos() === freezeFrom;

  // Protect content while frozen, and also through the single render where we
  // leave the frozen state: `committedFrozenRef` still reflects the previous
  // commit, so we keep returning the exact same cached element reference.
  const protecting =
    (frozen || committedFrozenRef.current) && renderRef.current != null;

  if (!protecting) {
    renderRef.current = (
      <GetPosContext.Provider value={props.getPos}>
        <Component {...props} />
      </GetPosContext.Provider>
    );
  }

  useLayoutEffect(() => {
    const wasFrozen = committedFrozenRef.current;
    committedFrozenRef.current = frozen;

    if (wasFrozen && !frozen) forceRemount();
  }, [frozen, forceRemount]);

  return renderRef.current;
});

export const GetPosContext = createContext<() => number>(
  null as unknown as () => number
);

export function RemountableNodeView(props: Omit<Props, "forceRemount">) {
  const [key, forceRemount] = useReducer((x) => x + 1, 0);
  return (
    <NodeView key={key.toString()} {...props} forceRemount={forceRemount} />
  );
}
