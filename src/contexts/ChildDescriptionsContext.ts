import { MutableRefObject, createContext } from "react";

import { CompositionViewDesc, ViewDesc } from "../viewdesc.js";

export type ChildDescriptionsContextValue = {
  parentRef: MutableRefObject<ViewDesc | undefined>;
  siblingsRef: MutableRefObject<ViewDesc[]>;
  findCompositionDOM: (compositionViewDesc: CompositionViewDesc) => void;
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
