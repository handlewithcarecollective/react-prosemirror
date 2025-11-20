import { Command } from "prosemirror-state";

import {
  ReactKeysPluginMeta,
  reactKeysPluginKey,
} from "../plugins/reactKeys.js";

/**
 * Create a command function that reorders the adjacent nodes starting
 * at the provided position.
 *
 * @param pos - The `start` position of the parent of the nodes being reordered
 * @param order - The new order for the nodes, expressed as an array of indices. For
 *                example, to swap the first two nodes in a set of three, `order`
 *                would be set to `[1, 0, 2]`. To move the first node to the end,
 *                and keep the other two in relative order, set `order` to `[1, 2, 0]`.
 */
export function reorderSiblings(pos: number, order: number[]): Command {
  return function reorderSiblingsCommand(state, dispatch) {
    const $pos = state.doc.resolve(pos);
    if ($pos.start() !== pos) {
      return false;
    }

    if (!dispatch) return true;

    const nodes = $pos.parent.children;

    const reordered = nodes
      .map((node, i) => [node, i] as const)
      .sort(([, a], [, b]) => order[a]! - order[b]!)
      .map(([node]) => node);

    const tr = state.tr;
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

    dispatch(tr);

    return true;
  };
}
