import { DOMSerializer, Mark } from "prosemirror-model";
import { MarkViewConstructor } from "prosemirror-view";
import React, { ReactNode, memo, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

import { ChildDescriptionsContext } from "../../contexts/ChildDescriptionsContext.js";
import { DOMNode } from "../../dom.js";
import { useForceUpdate } from "../../hooks/useForceUpdate.js";
import { useMarkViewDescription } from "../../hooks/useMarkViewDescription.js";

interface Props {
  constructor: MarkViewConstructor;
  mark: Mark;
  inline: boolean;
  getPos: () => number;
  children: ReactNode;
}

export const MarkViewConstructorView = memo(function MarkViewConstructorView({
  constructor,
  mark,
  inline,
  getPos,
  children,
}: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const innerRef = useRef<(HTMLSpanElement & HTMLDivElement) | null>(null);
  const forceUpdate = useForceUpdate();

  const markProps = useMemo(
    () => ({
      mark,
      inline,
      getPos,
      contentDOMRef: { current: null },
    }),
    [mark, inline, getPos]
  );

  const createMarkView: MarkViewConstructor = (...args) => {
    const markView = constructor(...args);
    if (!markView || !markView.dom) {
      const spec = mark.type.spec.toDOM?.(mark, inline);
      if (!spec) {
        throw new Error(`Mark spec for ${mark.type.name} is missing toDOM`);
      }

      return DOMSerializer.renderSpec(document, spec, null);
    }

    return markView;
  };

  const { childContextValue, contentDOM } = useMarkViewDescription(
    () => ref.current,
    (markView) => markView?.contentDOM ?? null,
    (...args) => {
      const markView = createMarkView(...args);
      const dom = markView.dom;
      const wrapperDOM = (innerRef.current ?? ref.current) as DOMNode;
      wrapperDOM.appendChild(dom);

      // Force a re-render so that we properly create
      // a portal into the contentDOM/dom
      forceUpdate();

      return {
        ...markView,
        destroy() {
          markView.destroy?.();

          wrapperDOM.removeChild(dom);
        },
        ignoreMutation: markView.ignoreMutation,
      };
    },
    markProps
  );

  const Component = inline ? "span" : "div";

  const props = { ref: innerRef };

  return (
    <Component {...props}>
      {contentDOM
        ? createPortal(
            <ChildDescriptionsContext.Provider value={childContextValue}>
              {children}
            </ChildDescriptionsContext.Provider>,
            contentDOM
          )
        : null}
    </Component>
  );
});
