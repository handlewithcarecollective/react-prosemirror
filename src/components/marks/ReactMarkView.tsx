import { Mark } from "prosemirror-model";
import React, {
  ComponentType,
  ReactNode,
  memo,
  useCallback,
  useMemo,
  useRef,
} from "react";

import { ChildDescriptionsContext } from "../../contexts/ChildDescriptionsContext.js";
import {
  IgnoreMutation,
  IgnoreMutationContext,
} from "../../contexts/IgnoreMutationContext.js";
import { DOMNode } from "../../dom.js";
import { useGetPos } from "../../hooks/useGetPos.js";
import { useMarkViewDescription } from "../../hooks/useMarkViewDescription.js";
import { KeyInfo } from "../../keys.js";

import { MarkViewComponentProps } from "./MarkViewComponentProps.js";

interface Props {
  component: ComponentType<MarkViewComponentProps>;
  mark: Mark;
  keyInfo: KeyInfo;
  inline: boolean;
  children: ReactNode;
}

export const ReactMarkView = memo(function ReactMarkView({
  component: Component,
  mark,
  inline,
  keyInfo,
  children,
}: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const contentDOMRef = useRef<HTMLElement | null>(null);

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

  const getParentPos = useGetPos(keyInfo.parentKey);
  const getPos = useCallback(() => {
    return getParentPos() + keyInfo.offset;
  }, [getParentPos, keyInfo.offset]);

  const markViewDescProps = useMemo(
    () => ({
      mark,
      getPos,
      inline,
    }),
    [getPos, inline, mark]
  );

  const { childContextValue, refUpdated } = useMarkViewDescription(
    () => ref.current,
    () => contentDOMRef.current ?? ref.current,
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
    markViewDescProps
  );

  const setDOM = useCallback(
    (el: HTMLElement | null) => {
      ref.current = el;
      refUpdated();
    },
    [refUpdated]
  );

  const setContentDOM = useCallback(
    (el: HTMLElement | null) => {
      contentDOMRef.current = el;
      refUpdated();
    },
    [refUpdated]
  );

  const markProps = useMemo(
    () => ({
      ...markViewDescProps,
      contentDOMRef: setContentDOM,
    }),
    [markViewDescProps, setContentDOM]
  );

  const props = {
    markProps,
    ref: setDOM,
  } satisfies MarkViewComponentProps;

  return (
    <IgnoreMutationContext.Provider value={setIgnoreMutation}>
      <ChildDescriptionsContext.Provider value={childContextValue}>
        <Component {...props}>{children}</Component>
      </ChildDescriptionsContext.Provider>
    </IgnoreMutationContext.Provider>
  );
});
