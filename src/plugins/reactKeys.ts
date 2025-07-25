import { Node } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";

export function createNodeKey() {
  const key = Math.floor(Math.random() * 0xffffffffffff).toString(16);
  return key;
}

export const reactKeysPluginKey = new PluginKey<{
  posToKey: Map<number, string>;
  keyToPos: Map<string, number>;
  posToNode: Map<number, Node>;
}>("@handlewithcare/react-prosemirror/reactKeys");

/**
 * Tracks a unique key for each (non-text) node in the
 * document, identified by its current position. Keys are
 * (mostly) stable across transaction applications. The
 * key for a given node can be accessed by that node's
 * current position in the document, and vice versa.
 */
export function reactKeys() {
  let composing = false;
  return new Plugin({
    key: reactKeysPluginKey,
    state: {
      init(_, state) {
        const next = {
          posToKey: new Map<number, string>(),
          keyToPos: new Map<string, number>(),
        };
        state.doc.descendants((_, pos) => {
          const key = createNodeKey();

          next.posToKey.set(pos, key);
          next.keyToPos.set(key, pos);
          return true;
        });
        return next;
      },
      /**
       * Keeps node keys stable across transactions.
       *
       * To accomplish this, we map each node position forwards
       * through the transaction to identify its current position,
       * and assign its key to that new position, dropping it if the
       * node was deleted.
       */
      apply(tr, value, _, newState) {
        if (!tr.docChanged || composing) {
          return value;
        }

        const next = {
          posToKey: new Map<number, string>(),
          keyToPos: new Map<string, number>(),
        };
        const posToKeyEntries = Array.from(value.posToKey.entries()).sort(
          ([a], [b]) => a - b
        );
        for (const [pos, key] of posToKeyEntries) {
          const { pos: newPos, deleted } = tr.mapping.mapResult(pos);
          if (deleted) continue;

          next.posToKey.set(newPos, key);
          next.keyToPos.set(key, newPos);
        }
        newState.doc.descendants((_, pos) => {
          if (next.posToKey.has(pos)) return true;

          const key = createNodeKey();
          next.posToKey.set(pos, key);
          next.keyToPos.set(key, pos);
          return true;
        });
        return next;
      },
    },
    props: {
      handleDOMEvents: {
        compositionstart: () => {
          composing = true;
        },
        compositionend: () => {
          composing = false;
        },
      },
    },
  });
}
