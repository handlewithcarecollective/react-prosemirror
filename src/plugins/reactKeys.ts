import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

import { ReactWidgetType, widget } from "../decorations/ReactWidgetType.js";

export function createNodeKey() {
  const key = Math.floor(Math.random() * 0xffffffffffff).toString(16);
  return key;
}

export interface ReactKeysPluginState {
  posToKey: Map<number, string>;
  keyToPos: Map<string, number>;
  cursorWrapper: Decoration | null;
  freezeFrom: number | null;
}

export const reactKeysPluginKey = new PluginKey<ReactKeysPluginState>(
  "@handlewithcare/react-prosemirror/reactKeys"
);

export type ReactKeysPluginMeta =
  | {
      overrides?: Record<number, number>;
      cursorWrapper?: Decoration | null;
      freezeFrom?: number | null;
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
  return new Plugin({
    key: reactKeysPluginKey,
    state: {
      init(_, state) {
        const next: ReactKeysPluginState = {
          posToKey: new Map<number, string>(),
          keyToPos: new Map<string, number>(),
          cursorWrapper: null,
          freezeFrom: null,
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
        const meta = tr.getMeta(reactKeysPluginKey) as ReactKeysPluginMeta;

        const overrides = meta && "overrides" in meta ? meta.overrides : {};

        const cursorWrapper =
          meta && "cursorWrapper" in meta ? meta.cursorWrapper : undefined;

        const freezeFrom =
          meta && "freezeFrom" in meta ? meta.freezeFrom : undefined;

        const next = {
          posToKey: new Map<number, string>(),
          keyToPos: new Map<string, number>(),
          cursorWrapper:
            cursorWrapper === undefined
              ? value.cursorWrapper
                ? widget(
                    tr.mapping.map(value.cursorWrapper.from, -1),
                    (
                      value.cursorWrapper as Decoration & {
                        type: ReactWidgetType;
                      }
                    ).type.Component,
                    value.cursorWrapper.spec
                  )
                : null
              : cursorWrapper,
          freezeFrom:
            freezeFrom === undefined
              ? value.freezeFrom !== null
                ? tr.mapping.map(value.freezeFrom, -1)
                : null
              : freezeFrom,
        };

        if (
          value.freezeFrom !== null &&
          next.freezeFrom !== null &&
          tr.getMeta("composition") == null
        ) {
          const oldBlock = oldState.doc.nodeAt(value.freezeFrom);
          const newBlock = newState.doc.nodeAt(next.freezeFrom);
          if (newBlock && !oldBlock?.eq(newBlock)) {
            next.freezeFrom = null;
            next.cursorWrapper = null;
          }
        }

        if (!tr.docChanged) {
          return {
            ...value,
            cursorWrapper: next.cursorWrapper,
            freezeFrom: next.freezeFrom,
          };
        }

        const posToKeyEntries = Array.from(value.posToKey.entries()).sort(
          ([a], [b]) => a - b
        );
        for (const [pos, key] of posToKeyEntries) {
          const override = overrides?.[pos];

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
      decorations(state) {
        const deco = reactKeysPluginKey.getState(state)?.cursorWrapper;

        if (!deco) return DecorationSet.empty;

        return DecorationSet.create(state.doc, [deco]);
      },
    },
  });
}
