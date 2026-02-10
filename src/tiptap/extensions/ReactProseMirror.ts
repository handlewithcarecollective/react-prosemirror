import { Extension } from "@tiptap/core";

import { reorderSiblingsOnTransaction } from "../../commands/reorderSiblings.js";
import { reactKeys } from "../../plugins/reactKeys.js";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    reactProseMirrorCommands: {
      reorderSiblings: (pos: number, order: number[]) => ReturnType;
    };
  }
}

export const ReactProseMirror = Extension.create({
  name: "@handlewithcare/react-prosemirror/reactKeys",
  addProseMirrorPlugins() {
    return [reactKeys()];
  },
  addCommands() {
    return {
      /**
       * Command that reorders the adjacent nodes starting
       * at the provided position.
       *
       * @param pos - The `start` position of the parent of the nodes being reordered
       * @param order - The new order for the nodes, expressed as an array of indices. For
       *                example, to swap the first two nodes in a set of three, `order`
       *                would be set to `[1, 0, 2]`. To move the first node to the end,
       *                and keep the other two in relative order, set `order` to `[1, 2, 0]`.
       */
      reorderSiblings(initialPos, order) {
        return function reorderSiblingsCommand({ tr, state, dispatch }) {
          return reorderSiblingsOnTransaction(
            initialPos,
            order,
            tr,
            state,
            dispatch
          );
        };
      },
    };
  },
});
