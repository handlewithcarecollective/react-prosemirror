import { Mark, Node } from "prosemirror-model";
import { Decoration, DecorationSource } from "prosemirror-view";
import React, {
  ComponentType,
  ReactNode,
  cloneElement,
  createElement,
  memo,
  useContext,
  useRef,
} from "react";

import { ChildDescriptionsContext } from "../contexts/ChildDescriptionsContext.js";
import { EditorContext } from "../contexts/EditorContext.js";
import { ReactWidgetDecoration } from "../decorations/ReactWidgetType.js";
import { InternalDecorationSource } from "../decorations/internalTypes.js";
import { iterDeco } from "../decorations/iterDeco.js";
import { useReactKeys } from "../hooks/useReactKeys.js";
import { KeyInfo } from "../keys.js";
import { htmlAttrsToReactProps, mergeReactProps } from "../props.js";
import { sameOuterDeco } from "../viewdesc.js";

import { NativeWidgetView } from "./NativeWidgetView.js";
import { SeparatorHackView } from "./SeparatorHackView.js";
import { TextNodeView } from "./TextNodeView.js";
import { TrailingHackView } from "./TrailingHackView.js";
import { WidgetView } from "./WidgetView.js";
import { MarkView } from "./marks/MarkView.js";
import { NodeView } from "./nodes/NodeView.js";

export function wrapInDeco(reactNode: JSX.Element | string, deco: Decoration) {
  const {
    nodeName,
    ...attrs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = (deco as any).type.attrs;

  const props = htmlAttrsToReactProps(attrs);

  // We auto-wrap text nodes in spans so that we can apply attributes
  // and styles, but we want to avoid double-wrapping the same
  // text node
  if (nodeName || typeof reactNode === "string") {
    return createElement(nodeName ?? "span", props, reactNode);
  }

  return cloneElement(reactNode, mergeReactProps(reactNode.props, props));
}

function areChildrenEqual(a: Child, b: Child) {
  return (
    a.type === b.type &&
    a.marks.every((mark) => mark.isInSet(b.marks)) &&
    b.marks.every((mark) => mark.isInSet(a.marks)) &&
    a.key.eq(b.key) &&
    (a.type !== "node" ||
      b.type !== "node" ||
      (a.node.eq(b.node) &&
        sameOuterDeco(a.outerDeco, b.outerDeco) &&
        (a.innerDeco as InternalDecorationSource).eq(b.innerDeco))) &&
    (a as ChildWidget).widget === (b as ChildWidget).widget
  );
}

type ChildWidget = {
  type: "widget";
  widget: ReactWidgetDecoration;
  marks: readonly Mark[];
  offset: number;
  index: number;
  key: KeyInfo;
};

type ChildNativeWidget = {
  type: "native-widget";
  widget: Decoration;
  marks: readonly Mark[];
  offset: number;
  index: number;
  key: KeyInfo;
};

type ChildNode = {
  type: "node";
  node: Node;
  marks: readonly Mark[];
  innerDeco: DecorationSource;
  outerDeco: readonly Decoration[];
  offset: number;
  index: number;
  key: KeyInfo;
};

type ChildHack = {
  type: "hack";
  component: ComponentType<{ keyInfo: KeyInfo }>;
  marks: readonly Mark[];
  offset: number;
  index: number;
  key: KeyInfo;
};

type Child = ChildNode | ChildWidget | ChildNativeWidget | ChildHack;

type SharedMarksProps = {
  childViews: Child[];
};

const ChildView = memo(function ChildView({ child }: { child: Child }) {
  const { view } = useContext(EditorContext);
  const reactKeys = useReactKeys();

  return child.type === "widget" ? (
    <WidgetView
      key={child.key.toString()}
      widget={child.widget as unknown as ReactWidgetDecoration}
      keyInfo={child.key}
    />
  ) : child.type === "native-widget" ? (
    <NativeWidgetView
      key={child.key.toString()}
      widget={child.widget}
      keyInfo={child.key}
    />
  ) : child.type === "hack" ? (
    <child.component key={child.key.toString()} keyInfo={child.key} />
  ) : child.node.isText ? (
    <ChildDescriptionsContext.Consumer key={child.key.toString()}>
      {({ siblingsRef, parentRef }) => (
        <TextNodeView
          view={view}
          node={child.node}
          keyInfo={child.key}
          siblingsRef={siblingsRef}
          parentRef={parentRef}
          reactKeys={reactKeys}
          decorations={child.outerDeco}
        />
      )}
    </ChildDescriptionsContext.Consumer>
  ) : (
    <NodeView
      key={child.key.toString()}
      node={child.node}
      keyInfo={child.key}
      outerDeco={child.outerDeco}
      innerDeco={child.innerDeco}
    />
  );
});

const InlinePartition = memo(function InlinePartition({
  childViews,
}: {
  childViews: [Child, ...Child[]];
}) {
  const firstChild = childViews[0];

  const firstMark = firstChild.marks[0];
  if (!firstMark) {
    return (
      <>
        {childViews.map((child) => {
          return <ChildView key={child.key.toString()} child={child} />;
        })}
      </>
    );
  }

  return (
    <MarkView
      key={firstChild.key.toString()}
      mark={firstMark}
      keyInfo={firstChild.key}
      inline
    >
      <InlineView
        key={firstChild.key.toString()}
        childViews={childViews.map((child) => ({
          ...child,
          marks: child.marks.slice(1),
        }))}
      />
    </MarkView>
  );
});

const InlineView = memo(function InlineView({ childViews }: SharedMarksProps) {
  // const editorState = useEditorState();
  const partitioned = childViews.reduce((acc, child) => {
    const lastPartition = acc[acc.length - 1];
    if (!lastPartition) {
      return [[child]];
    }
    const lastChild = lastPartition[lastPartition.length - 1];
    if (!lastChild) {
      return [...acc.slice(0, acc.length), [child]];
    }

    if (
      (!child.marks.length && !lastChild.marks.length) ||
      (child.marks.length &&
        lastChild.marks.length &&
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        child.marks[0]?.eq(lastChild.marks[0]!))
    ) {
      return [
        ...acc.slice(0, acc.length - 1),
        [...lastPartition.slice(0, lastPartition.length), child],
      ];
    }

    return [...acc, [child]];
  }, [] as Child[][]);

  return (
    <>
      {partitioned.map((childViews) => {
        const firstChild = childViews[0];
        if (!firstChild) return null;
        return (
          <InlinePartition
            key={firstChild.key.toString()}
            childViews={childViews as [Child, ...Child[]]}
          />
        );
      })}
    </>
  );
});

function createKey(
  innerPos: number,
  offset: number,
  index: number,
  type: Child["type"],
  posToKey: Map<number, string>,
  widget?: ReactWidgetDecoration | Decoration
) {
  const pos = innerPos + offset;
  const key =
    type === "widget" || type === "native-widget"
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (widget as any).type.spec.key
      : posToKey.get(pos);

  if (type === "widget" && !key) {
    // eslint-disable-next-line no-console
    console.warn(
      `Widget at position ${pos} doesn't have a key specified. React ProseMirror will generate a key partially based on this widget’s index into its parent’s children. This can cause issues if there are multiple adjacent widgets.`
    );
  }

  const parentPos = innerPos - 1;

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const parentKey = posToKey.get(parentPos)!;

  return new KeyInfo(
    key,
    type === "native-widget" ? "widget" : type,
    parentKey,
    offset,
    index
  );
}

function adjustWidgetMarksForward(
  lastNodeChild: ChildNode | null,
  widgetChild: ChildWidget | ChildNativeWidget | null
) {
  if (
    !widgetChild ||
    // Using internal Decoration property, "type"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (widgetChild.widget as any).type.side >= 0
  )
    return;

  if (!lastNodeChild || !lastNodeChild.node.isInline) return;

  const marksToSpread = lastNodeChild.marks;

  widgetChild.marks = widgetChild.marks.reduce(
    (acc, mark) => mark.addToSet(acc),
    marksToSpread
  );
}

function adjustWidgetMarksBack(
  widgetChildren: Array<ChildNativeWidget | ChildWidget>,
  nodeChild: ChildNode
) {
  if (!nodeChild.node.isInline) return;

  const marksToSpread = nodeChild.marks;
  for (let i = widgetChildren.length - 1; i >= 0; i--) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const child = widgetChildren[i]!;

    if (
      // Using internal Decoration property, "type"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (child.widget as any).type.side < 0
    ) {
      continue;
    }

    child.marks = child.marks.reduce(
      (acc, mark) => mark.addToSet(acc),
      marksToSpread
    );
  }
}

const ChildElement = memo(
  function ChildElement({ child }: { child: Child }) {
    if (child.type === "node") {
      return child.marks.reduce(
        (element, mark) => (
          <MarkView mark={mark} keyInfo={child.key} inline={false}>
            {element}
          </MarkView>
        ),
        <NodeView
          key={child.key.toString()}
          outerDeco={child.outerDeco}
          node={child.node}
          innerDeco={child.innerDeco}
          keyInfo={child.key}
        />
      );
    } else {
      return <InlineView key={child.key.toString()} childViews={[child]} />;
    }
  }
  /**
   * It's safe to skip re-rendering a ChildElement component as long
   * as its child prop is shallowly equivalent to the previous render.
   * posToKey will be updated on every doc update, but if the child
   * hasn't changed, it will still have the same key.
   */
  // (prevProps, nextProps) => areChildrenEqual(prevProps.child, nextProps.child)
);

function createChildElements(children: Child[]): ReactNode[] {
  const firstChild = children[0];
  if (!firstChild) return [];

  if (children.every((child) => child.type !== "node" || child.node.isInline)) {
    return [
      <InlineView key={firstChild.key.toString()} childViews={children} />,
    ];
  }

  return children.map((child) => {
    return <ChildElement key={child.key.toString()} child={child} />;
  });
}

export const ChildNodeViews = memo(function ChildNodeViews({
  keyInfo,
  node,
  innerDecorations,
}: {
  keyInfo?: KeyInfo;
  node: Node | undefined;
  innerDecorations: DecorationSource;
}) {
  const reactKeys = useReactKeys();

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const innerPos = keyInfo ? reactKeys.keyToPos.get(keyInfo.key!)! + 1 : 0;

  const childMap = useRef(new Map<string, Child>()).current;

  if (!node) return null;

  const keysSeen = new Map<string, number>();

  let widgetChildren: Array<ChildNativeWidget | ChildWidget> = [];
  let lastNodeChild: ChildNode | null = null;

  iterDeco(
    node,
    innerDecorations,
    (widget, isNative, offset, index) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const widgetMarks = ((widget as any).type.spec.marks as Mark[]) ?? [];
      let key;
      if (isNative) {
        key = createKey(
          innerPos,
          offset,
          index,
          "native-widget",
          reactKeys.posToKey,
          widget
        );
        const child = {
          type: "native-widget",
          widget,
          marks: widgetMarks,
          offset,
          index,
          key,
        } as const;
        const prevChild = childMap.get(key.toString());
        if (prevChild && areChildrenEqual(prevChild, child)) {
          prevChild.offset = offset;
        } else {
          childMap.set(key.toString(), child);
        }
        keysSeen.set(key.toString(), keysSeen.size);
      } else {
        key = createKey(
          innerPos,
          offset,
          index,
          "widget",
          reactKeys.posToKey,
          widget
        );
        const child = {
          type: "widget",
          widget: widget as ReactWidgetDecoration,
          marks: widgetMarks,
          offset,
          index,
          key,
        } as const;
        const prevChild = childMap.get(key.toString());
        if (prevChild && areChildrenEqual(prevChild, child)) {
          prevChild.offset = offset;
        } else {
          childMap.set(key.toString(), child);
        }
        keysSeen.set(key.toString(), keysSeen.size);
      }
      const child = childMap.get(key.toString()) as
        | ChildWidget
        | ChildNativeWidget;
      widgetChildren.push(child);
      adjustWidgetMarksForward(
        lastNodeChild,
        childMap.get(key.toString()) as ChildWidget | ChildNativeWidget
      );
    },
    (childNode, outerDeco, innerDeco, offset, index) => {
      const key = createKey(
        innerPos,
        offset,
        index,
        "node",
        reactKeys.posToKey
      );
      const child = {
        type: "node",
        node: childNode,
        marks: childNode.marks,
        innerDeco,
        outerDeco,
        offset,
        index,
        key,
      } as const;
      const prevChild = childMap.get(key.toString());
      if (prevChild && areChildrenEqual(prevChild, child)) {
        prevChild.offset = offset;
        lastNodeChild = prevChild as ChildNode;
      } else {
        childMap.set(key.toString(), child);
        lastNodeChild = child;
      }
      keysSeen.set(key.toString(), keysSeen.size);
      adjustWidgetMarksBack(widgetChildren, lastNodeChild);
      widgetChildren = [];
    }
  );

  for (const key of childMap.keys()) {
    if (!keysSeen.has(key)) {
      childMap.delete(key);
    }
  }

  const children = Array.from(childMap.values()).sort(
    // We already ensured that these existed in keysSeen in the previous
    // step
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    (a, b) => keysSeen.get(a.key.toString())! - keysSeen.get(b.key.toString())!
  );

  if (node.isTextblock) {
    const lastChild = children[children.length - 1];

    if (
      !lastChild ||
      lastChild.type !== "node" ||
      (lastChild.node.isInline && !lastChild.node.isText) ||
      // RegExp.test actually handles undefined just fine
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      /\n$/.test(lastChild.node.text!)
    ) {
      children.push(
        {
          type: "hack",
          component: SeparatorHackView,
          marks: [],
          offset: lastChild?.offset ?? 0,
          index: (lastChild?.index ?? 0) + 2,
          key: new KeyInfo(
            undefined,
            "hack",
            keyInfo?.key,
            lastChild
              ? lastChild.offset +
                (lastChild.type === "node" ? lastChild.node.nodeSize : 0)
              : 0,
            lastChild?.index ?? 0
          ),
        },
        {
          type: "hack",
          component: TrailingHackView,
          marks: [],
          offset: lastChild?.offset ?? 0,
          index: (lastChild?.index ?? 0) + 1,
          key: new KeyInfo(
            undefined,
            "hack",
            keyInfo?.key,
            lastChild
              ? lastChild.offset +
                (lastChild.type === "node" ? lastChild.node.nodeSize : 0)
              : 0,
            (lastChild?.index ?? 0) + 1
          ),
        }
      );
    }
  }

  const childElements = createChildElements(children);

  return <>{childElements}</>;
});
