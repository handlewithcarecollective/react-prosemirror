import { Node } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import { ReplaceStep } from "prosemirror-transform";

export function createNodeKey() {
  const key = Math.floor(Math.random() * 0xffffffffffff).toString(16);
  return key;
}

export const reactKeysPluginKey = new PluginKey<{
  posToKey: Map<number, string>;
  keyToPos: Map<string, number>;
  posToNode: Map<number, Node>;
}>("@handlewithcare/react-prosemirror/reactKeys");

export type ReactKeysPluginMeta =
  | {
      overrides: Record<number, number>;
    }
  | undefined;

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
      apply(tr, value, oldState, newState) {
        if (!tr.docChanged || composing) {
          return value;
        }

        const metaOverrides = (
          tr.getMeta(reactKeysPluginKey) as ReactKeysPluginMeta
        )?.overrides;

        const overrides: Record<number, number> = { ...metaOverrides };

        // setNodeMarkup just does a replace for leaf nodes. To prevent the
        // component from being remounted in this case, add an override if the
        // transaction has exactly one step that replaces a leaf node with
        // another node of the same type
        if (tr.steps.length === 1) {
          const step = tr.steps[0];
          if (step instanceof ReplaceStep) {
            const { from, to, slice } = step;
            const oldNode = oldState.doc.nodeAt(from);
            const newNode =
              slice.content.childCount === 1 ? slice.content.child(0) : null;
            if (
              oldNode &&
              newNode &&
              oldNode.isLeaf &&
              newNode.isLeaf &&
              oldNode.type === newNode.type &&
              to === from + oldNode.nodeSize
            ) {
              overrides[from] = from;
            }
          }
        }

        const next = {
          posToKey: new Map<number, string>(),
          keyToPos: new Map<string, number>(),
        };
        const posToKeyEntries = Array.from(value.posToKey.entries()).sort(
          ([a], [b]) => a - b
        );
        for (const [pos, key] of posToKeyEntries) {
          const override = overrides[pos];

          const { pos: newPos, deleted } =
            override === undefined
              ? tr.mapping.mapResult(pos)
              : { pos: override, deleted: false };
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
