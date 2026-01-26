import { Mark } from "prosemirror-model";
import React, {
  ComponentType,
  ReactNode,
  memo,
  useCallback,
  useMemo,
  useRef,
} from "react";

import { ChildDescriptorsContext } from "../../contexts/ChildDescriptorsContext.js";
import {
  IgnoreMutation,
  IgnoreMutationContext,
} from "../../contexts/IgnoreMutationContext.js";
import { DOMNode } from "../../dom.js";
import { useMarkViewDescription } from "../../hooks/useMarkViewDescription.js";

import { MarkViewComponentProps } from "./MarkViewComponentProps.js";

interface Props {
  component: ComponentType<MarkViewComponentProps>;
  mark: Mark;
  getPos: () => number;
  inline: boolean;
  children: ReactNode;
}

export const ReactMarkView = memo(function ReactMarkView({
  component: Component,
  mark,
  inline,
  getPos,
  children,
}: Props) {
  const ref = useRef<HTMLElement | null>(null);

  const ignoreMutationRef = useRef<IgnoreMutation | null>(null);

  const setIgnoreMutation = useCallback((handler: IgnoreMutation | null) => {
    ignoreMutationRef.current = handler;
    return () => {
      ignoreMutationRef.current = null;
      return () => {
        ignoreMutationRef.current = null;
      };
    };
  }, []);

  const markProps = useMemo(
    () => ({
      mark,
      getPos,
      inline,
    }),
    [getPos, inline, mark]
  );

  const { childContextValue } = useMarkViewDescription(
    ref,
    () => ({
      dom: ref.current as DOMNode,
      ignoreMutation(mutation) {
        const ignoreMutation = ignoreMutationRef.current;
        if (ignoreMutation) {
          return ignoreMutation(mutation);
        }

        return false;
      },
    }),
    markProps
  );

  const props = {
    markProps,
    ref,
  } satisfies MarkViewComponentProps;

  return (
    <IgnoreMutationContext.Provider value={setIgnoreMutation}>
      <ChildDescriptorsContext.Provider value={childContextValue}>
        <Component {...props}>{children}</Component>
      </ChildDescriptorsContext.Provider>
    </IgnoreMutationContext.Provider>
  );
});
