import { MutableRefObject, createContext } from "react";

import { ViewDesc } from "../viewdesc.js";

export type ChildDescriptionsContextValue = {
  parentRef: MutableRefObject<ViewDesc | undefined>;
  siblingsRef: MutableRefObject<ViewDesc[]>;
};

export const ChildDescriptionsContext =
  createContext<ChildDescriptionsContextValue>({
    parentRef: { current: undefined },
    siblingsRef: {
      current: [],
    },
  });
