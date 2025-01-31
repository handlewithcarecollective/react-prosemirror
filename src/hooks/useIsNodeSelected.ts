import { useState } from "react";

import { useSelectNode } from "./useSelectNode.js";

export function useIsNodeSelected() {
  const [isSelected, setIsSelected] = useState(false);

  useSelectNode(
    () => {
      setIsSelected(true);
    },
    () => {
      setIsSelected(false);
    }
  );

  return isSelected;
}
