/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { render } from "@testing-library/react";
import { Schema } from "prosemirror-model";
import { EditorState, Transaction } from "prosemirror-state";
import React, { useCallback, useState } from "react";
import { flushSync } from "react-dom";

import { reactKeys, reactKeysPluginKey } from "../../plugins/reactKeys.js";
import { ProseMirror } from "../ProseMirror.js";
import { ProseMirrorDoc } from "../ProseMirrorDoc.js";

declare global {
  interface Window {
    gc?: () => void;
  }
}

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*", toDOM: () => ["p", 0] },
    text: { group: "inline" },
  },
});

// Each transaction produces a new reactKeys plugin-state "generation". We hold a
// WeakRef to every generation so that, after a forced GC, we can count how many
// are still *reachable* (i.e. retained). The fix mutates a single shared object
// in place, so only one generation ever exists; stock allocates a fresh object
// per transaction, each pinned forever by a node view's memoized closure.
let generations: WeakRef<object>[] = [];
let createdCount = 0;
let live: { state: EditorState; dispatch: (tr: Transaction) => void } | null =
  null;

function track(state: EditorState) {
  const pluginState = reactKeysPluginKey.getState(state);
  if (!pluginState) return;
  generations.push(new WeakRef(pluginState));
  createdCount += 1;
}

function Harness() {
  const [state, setState] = useState(() => {
    const initial = EditorState.create({
      doc: schema.nodes.doc.create(null, [schema.nodes.paragraph.create()]),
      plugins: [reactKeys()],
    });
    track(initial);
    return initial;
  });

  const dispatch = useCallback((tr: Transaction) => {
    setState((prev) => {
      const next = prev.apply(tr);
      track(next);
      return next;
    });
  }, []);

  live = { state, dispatch };

  return (
    <ProseMirror state={state} dispatchTransaction={dispatch}>
      <ProseMirrorDoc />
    </ProseMirror>
  );
}

async function grow(n: number) {
  for (let i = 0; i < n; i++) {
    const current = live!;
    const tr = current.state.tr.insert(
      current.state.doc.content.size,
      schema.nodes.paragraph.create()
    );
    // flushSync forces a synchronous commit per transaction, so React actually
    // renders (and memo-bails) each generation instead of batching the loop.
    flushSync(() => current.dispatch(tr));
    if (i % 25 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}

function measure() {
  const alive = new Set<object>();
  for (const ref of generations) {
    const obj = ref.deref();
    if (obj) alive.add(obj);
  }
  return { created: createdCount, distinctAlive: alive.size };
}

describe("reactKeys memory retention", () => {
  before(function () {
    // window.gc requires Chrome launched with --js-flags=--expose-gc (set for
    // the chrome capability in wdio.conf.ts). Firefox has no window.gc, so the
    // retention assertion is Chrome-only.
    if (typeof window.gc !== "function") {
      this.skip();
    }
  });

  beforeEach(() => {
    generations = [];
    createdCount = 0;
    live = null;
  });

  it("retains only O(1) plugin-state generations as the document grows", async () => {
    render(<Harness />);

    const GROW = 400;
    await grow(GROW);

    // Force a few full GCs so unreachable generations are actually collected
    // before we count survivors (deref != undefined => still reachable).
    for (let i = 0; i < 3; i++) {
      window.gc!();
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const { created, distinctAlive } = measure();

    // Sanity: the grow loop produced a generation per transaction.
    expect(created).toBeGreaterThanOrEqual(GROW);

    // The fix keeps a single shared plugin-state object alive (~1). Without it,
    // every generation is pinned by a node view's fiber, so ~`created` survive.
    expect(distinctAlive).toBeLessThan(5);
  });
});
