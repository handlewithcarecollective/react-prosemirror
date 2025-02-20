import { DOMOutputSpec } from "prosemirror-model";
import React, {
  HTMLProps,
  ReactNode,
  createElement,
  forwardRef,
  memo,
} from "react";

import { htmlAttrsToReactProps, mergeReactProps } from "../props.js";

/**
 * Whether an output spec contains a hole
 */
function hasHole(outputSpec: DOMOutputSpec) {
  if (!Array.isArray(outputSpec)) {
    throw new Error(
      "@handlewithcare/react-prosemirror only supports strings and arrays in toDOM"
    );
  }

  const attrs = outputSpec[1];

  let start = 1;
  if (
    attrs &&
    typeof attrs === "object" &&
    attrs.nodeType == null &&
    !Array.isArray(attrs)
  ) {
    start = 2;
  }

  for (let i = start; i < outputSpec.length; i++) {
    const child = outputSpec[i] as DOMOutputSpec | 0;
    if (child === 0) {
      return true;
    }
    if (hasHole(child)) return true;
  }
  return false;
}

type Props = HTMLProps<HTMLElement> & {
  outputSpec: DOMOutputSpec;
  isMark?: boolean;
  children?: ReactNode;
};

const ForwardedOutputSpec = memo(
  forwardRef<HTMLElement, Props>(function OutputSpec(
    { outputSpec, isMark, children, ...propOverrides }: Props,
    ref
  ) {
    if (typeof outputSpec === "string") {
      return <>{outputSpec}</>;
    }

    if (!Array.isArray(outputSpec)) {
      throw new Error(
        "@handlewithcare/react-prosemirror only supports strings and arrays in toDOM"
      );
    }

    const tagSpec = outputSpec[0] as string;
    const tagName = tagSpec.replace(" ", ":");
    const attrs = outputSpec[1];

    let props: HTMLProps<HTMLElement> = {
      ref,
      ...propOverrides,
    };
    let start = 1;
    if (
      attrs &&
      typeof attrs === "object" &&
      attrs.nodeType == null &&
      !Array.isArray(attrs)
    ) {
      start = 2;
      props = mergeReactProps(htmlAttrsToReactProps(attrs), props);
    }

    const content: ReactNode[] = [];
    for (let i = start; i < outputSpec.length; i++) {
      const child = outputSpec[i] as DOMOutputSpec | 0;
      if (child === 0) {
        if (i < outputSpec.length - 1 || i > start) {
          throw new RangeError(
            "Content hole must be the only child of its parent node"
          );
        }
        return createElement(tagName, props, children);
      }
      content.push(
        <ForwardedOutputSpec outputSpec={child}>{children}</ForwardedOutputSpec>
      );
    }

    // https://prosemirror.net/docs/ref/#model.MarkSpec.toDOM
    // When the resulting spec contains a hole, that is where the
    // marked content is placed. Otherwise, it is appended to the top node.
    if (isMark && !hasHole(outputSpec)) {
      content.push(createElement(tagName, props, children));
    }
    return createElement(tagName, props, ...content);
  })
);

export { ForwardedOutputSpec as OutputSpec };
