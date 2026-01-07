import { Extension } from "@tiptap/core";

import {
  ReactKeysPluginMeta,
  reactKeys,
  reactKeysPluginKey,
} from "../../plugins/reactKeys.js";

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
        return function reorderSiblingsCommand({ tr, dispatch }) {
          const pos = tr.mapping.map(initialPos);
          const $pos = tr.doc.resolve(pos);
          if ($pos.start() !== pos) {
            return false;
          }

          if (!dispatch) return true;

          const nodes = $pos.parent.children;

          const reordered = nodes
            .map((node, i) => [node, i] as const)
            .sort(([, a], [, b]) => order[a]! - order[b]!)
            .map(([node]) => node);

          tr.replaceWith(pos, $pos.parent.content.size + pos, reordered);

          const meta: ReactKeysPluginMeta = { overrides: {} };

          const oldPositions: number[] = [];
          let start = pos;
          for (const node of nodes) {
            oldPositions.push(start);
            start += node.nodeSize;
          }

          start = pos;

          const newPositions: number[] = [];
          for (let i = 0; i < reordered.length; i++) {
            const node = reordered[i]!;
            newPositions[order[i]!] = start;
            start += node.nodeSize;
          }

          for (let i = 0; i < oldPositions.length; i++) {
            const oldPosition = oldPositions[i]!;
            const newPosition = newPositions[i]!;
            meta.overrides[oldPosition] = newPosition;
          }

          tr.setMeta(reactKeysPluginKey, meta);

          return true;
        };
      },
    };
  },
});
