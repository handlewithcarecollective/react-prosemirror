import { ViewMutationRecord } from "prosemirror-view";
import { createContext } from "react";

type IgnoreMutationtContextValue = (
  ignoreMutation: (mutation: ViewMutationRecord) => boolean
) => void;

export const IgnoreMutationContext = createContext<IgnoreMutationtContextValue>(
  null as unknown as IgnoreMutationtContextValue
);
