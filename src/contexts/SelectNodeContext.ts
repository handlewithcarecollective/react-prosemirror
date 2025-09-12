import { createContext } from "react";

export type SelectNode = () => void;
export type DeselectNode = () => void;

type SelectNodeContextValue = (
  selectNode: SelectNode,
  deselectNode: DeselectNode
) => void;

export const SelectNodeContext = createContext<SelectNodeContextValue>(
  null as unknown as SelectNodeContextValue
);
