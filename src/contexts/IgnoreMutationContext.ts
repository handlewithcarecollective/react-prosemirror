import { MarkView, NodeView, ViewMutationRecord } from "prosemirror-view";
import { createContext } from "react";

export type IgnoreMutation = (
  this: NodeView | MarkView,
  mutation: ViewMutationRecord
) => boolean;

type IgnoreMutationtContextValue = (ignoreMutation: IgnoreMutation) => void;

export const IgnoreMutationContext = createContext<IgnoreMutationtContextValue>(
  null as unknown as IgnoreMutationtContextValue
);
