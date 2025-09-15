import { createContext } from "react";

export type StopEvent = (event: Event) => boolean;

type StopEventContextValue = (stopEvent: (event: Event) => boolean) => void;

export const StopEventContext = createContext<StopEventContextValue>(
  null as unknown as StopEventContextValue
);
