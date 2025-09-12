import { ViewMutationRecord } from "prosemirror-view";
import { createContext } from "react";

export type IgnoreMutation = (mutation: ViewMutationRecord) => boolean;

type IgnoreMutationtContextValue = (ignoreMutation: IgnoreMutation) => void;

export const IgnoreMutationContext = createContext<IgnoreMutationtContextValue>(
  null as unknown as IgnoreMutationtContextValue
);
