# How prosemirror-view handles IME composition

This is the "source of truth" implementation. Files referenced are in
`../prosemirror-view/src`.

## The big picture: read-the-DOM, don't fight it

prosemirror-view's entire input model is **observe-and-reconcile**:

1. A `MutationObserver` (`domobserver.ts`) watches the contenteditable subtree.
2. The browser is allowed to mutate the DOM freely.
3. On every flush, `readDOMChange` (`domchange.ts`) re-parses the changed DOM
   region back into a ProseMirror slice, diffs it against the current document,
   and dispatches a transaction describing the difference.

Composition is _not_ a special input path that builds transactions from
`beforeinput` events. It is the same observe-and-reconcile loop, with three
extra concerns layered on top:

- **Don't redraw the DOM the IME is composing into.** A redraw mid-composition
  cancels the composition (especially on Safari, where even re-asserting an
  identical selection aborts it).
- **Know when composition starts/ends** so we can flush at the right moments and
  avoid misinterpreting composition mutations as ordinary edits.
- **Cancel the composition** if an out-of-band change overlaps the region being
  composed.

## State kept on `view.input` (`input.ts`)

```
composing               // is a composition currently active?
compositionNode         // the Text node the IME is mutating
compositionNodes        // CompositionViewDescs protecting orphaned DOM
compositionID           // increments each composition; tags transactions
compositionEndedAt      // timestamp, used to swallow the Safari Enter keydown
compositionPendingChanges // compositionID if mutations are queued at end
composingTimeout        // Android: drop composition after 5s inactivity
badSafariComposition    // Safari table-cell composition workaround
```

`view.composing` is just a getter over `view.input.composing`.

## Lifecycle

### compositionstart / compositionupdate (`input.ts:457`)

If not already composing:

1. `domObserver.flush()` — commit any pending ordinary changes first.
2. Decide whether the cursor needs to be wrapped in mark nodes. This is needed
   when there are `storedMarks`, when the cursor sits just after a non-inclusive
   mark, or for a Chrome/Windows-before-uneditable bug. In that case it sets
   `view.markCursor` and calls `endComposition(view, true)` to force a redraw
   that produces the cursor wrapper, then clears `markCursor`.
3. Otherwise `endComposition(view, !selection.empty)`, plus a Firefox fixup that
   moves the DOM cursor inside a preceding marked node so inserted text inherits
   marks.
4. `view.input.composing = true`.
5. `scheduleComposeEnd` (5s on Android, else off).

Note: PM **does not** disable selection syncing during composition. It keeps
reading the DOM selection; it is just careful about when it writes it back.

### During composition

The observer keeps running. Two things keep the composing DOM safe:

- **External transactions** that arrive go through `updateState` →
  `updateStateInner` (`index.ts:153`). Before redrawing, if composing it sets
  `view.input.compositionNode = findCompositionNode(view)`. Then
  `docView.update` → `updateChildren` (`viewdesc.ts:767`) calls
  `localCompositionInfo` to discover whether `compositionNode` lives inside this
  node and where its text sits in the PM content (via `findTextInFragment`). If
  so, `protectLocalComposition` (`viewdesc.ts:835`) "orphans" the composing DOM
  subtree (strips its siblings, clears their `pmViewDesc`) and slots a
  `CompositionViewDesc` into `this.children` at the matching position.
  `renderDescs` then leaves that DOM untouched. This is how a composition
  survives a redraw caused by e.g. a decoration plugin.

- If `localCompositionInfo` / `findTextInFragment` can no longer locate the
  composition node's text overlapping the selection (a change diverged PM from
  the DOM), protection is dropped — the region is redrawn from state, which
  **cancels** the composition.

### compositionend (`input.ts:502`)

1. `composing = false`, record `compositionEndedAt`.
2. `compositionPendingChanges = pendingRecords().length ? compositionID : 0`.
3. Flush: `forceFlush()` for bad-Safari, else a microtask
   `Promise.resolve().then(flush)`.
4. `compositionID++`, `scheduleComposeEnd(view, 20)`.

The **actual composed text is read by the observer flush → `readDOMChange`**,
not by the `compositionend` handler. The resulting transaction is tagged with
`setMeta("composition", compositionID)`.

### endComposition / clearComposition (`input.ts:520`, `554`)

- `clearComposition`: sets `composing = false` and pops every `compositionNodes`
  entry, calling `markParentsDirty()` so the protected DOM is redrawn from
  canonical state on the next update.
- `endComposition(view, restarting)`: `forceFlush`, `clearComposition`, then if
  restarting or dirty, reconcile the selection from the DOM (or
  `deleteSelection`, or `updateState`).

`__endComposition` is exported for tests to deterministically finish a
composition (the test suite calls it after dispatching `compositionend`).

## Reading the change: `readDOMChange` (`domchange.ts:81`)

This is the heart of the model and is shared by composition and ordinary typing:

1. If `from < 0` it is a selection-only change → set selection from DOM.
2. Otherwise `parseBetween` re-parses the changed DOM region into a doc slice,
   recording where the DOM selection maps to.
3. `findDiff` finds the minimal `{start, endA, endB}` changed range between the
   old slice and the parsed slice, biased by `lastKeyCode` (Backspace anchors to
   the end).
4. A cascade of heuristics decides whether the change is really an Enter press,
   a Backspace, a mark add/remove, a plain text insertion (`handleTextInput`),
   or a generic replace, and dispatches accordingly.
5. The transaction is tagged with the composition ID when composing.

Composition relies on this because the IME mutates text directly; PM never sees
the keystrokes, only the resulting DOM, which it diffs.

## Supporting pieces

- `findCompositionNode` (`input.ts:528`): from the DOM selection focus, look at
  the text node before/after; return whichever is the "changed" one, using
  `domObserver.lastChangedTextNode` as a hint.
- `findTextInFragment` (`viewdesc.ts`): locate the composition node's current
  text inside a fragment near the selection; returns -1 if it cannot, which
  drives cancellation.
- `CompositionViewDesc` (`viewdesc.ts:586`): a stand-in desc whose `size` is the
  composed text length and whose `domFromPos`/`localPosFromDOM` point into the
  orphaned `textDOM`. It keeps position accounting correct while the DOM is off
  in IME-land. `ignoreMutation` ignores no-op `characterData` events.
- Browser workarounds: bad Safari table-cell composition
  (`fixUpBadSafariComposition`), Safari Enter-after-compositionend swallow
  (`inOrNearComposition`), Android enter-and-pick-suggestion, Chrome
  delete-then-reinsert, Gecko bogus `<br>`s.

## What the test suite asserts (`test/webtest-composition.ts`)

The tests drive composition by directly mutating DOM text nodes + dispatching
synthetic `CompositionEvent`s and calling `flush(pm)`. Key invariants checked by
the `compose` helper:

- `pm.composing` is true between start and end.
- The composing node stays attached and the DOM selection (`focusNode`/`offset`)
  is **preserved across flushes** — i.e. redraws don't disturb it.
- `hasCompositionNode` (the focus is inside a `CompositionViewDesc`) is true
  when `{node: true}` is expected.
- After `__endComposition`, `pm.composing` is false and no `CompositionViewDesc`
  remains.

Scenarios covered: empty block; end/start of block in new node; inside existing
text; Android newline-after-composition; word replacement; inside marks; inside
multi-child marks; cursor wrapper (storedMarks); multi-child mark + cursor
wrapper; decoration changes mid-composition (`wordHighlighter`); inside
highlighted text; composition spanning multiple nodes; not overwriting adjacent
widgets; **cancel on full/partial/inside overlap**; not cancelling on a change
elsewhere; **rapid successive compositions**; **cross-paragraph composition**.
