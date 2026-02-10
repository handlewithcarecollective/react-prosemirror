/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Command, EditorState, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

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
    const tr = state.tr;
    return reorderSiblingsOnTransaction(pos, order, tr, state, dispatch);
  };
}

export function reorderSiblingsOnTransaction(
  pos: number,
  order: number[],
  tr: Transaction,
  state: EditorState,
  dispatch?: EditorView["dispatch"]
) {
  const orderLookup = order.reduce((acc, oldIndex, newIndex) => {
    acc[oldIndex] = newIndex;
    return acc;
  }, [] as number[]);

  const $pos = state.doc.resolve(pos);
  if ($pos.start() !== pos) {
    return false;
  }

  if (!dispatch) return true;

  const nodes = $pos.parent.children;

  const reordered = nodes
    .map((node, i) => [node, i] as const)
    .sort(([, a], [, b]) => orderLookup[a]! - orderLookup[b]!)
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

  dispatch(tr);

  return true;
}
