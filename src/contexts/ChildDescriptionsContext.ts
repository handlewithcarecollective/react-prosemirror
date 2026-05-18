import { MutableRefObject, createContext } from "react";

import { ViewDesc } from "../viewdesc.js";

export type ChildDescriptionsContextValue = {
  parentRef: MutableRefObject<ViewDesc | undefined>;
  siblingsRef: MutableRefObject<ViewDesc[]>;
  findCompositionDOM: () => void;
};

export const ChildDescriptionsContext =
  createContext<ChildDescriptionsContextValue>({
    parentRef: { current: undefined },
    siblingsRef: {
      current: [],
    },
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    findCompositionDOM: () => {},
  });
