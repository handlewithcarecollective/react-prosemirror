# Plan: align react-prosemirror composition with prosemirror-view

## Goal

Make react-prosemirror pass the full prosemirror-view composition test suite
(the source of truth), including the cases currently commented out:

- cancel on **partial** overlap
- cancel on **inside** overlap
- **rapid successive** compositions
- **cross-paragraph** composition (both variants)

without regressing the cases that pass today.

## Guiding principle

prosemirror-view solves the hard cases with one mechanism: **let the browser
mutate the DOM during composition, then read the result back and diff it against
state.** The cases react-prosemirror can't currently handle (cross-paragraph,
rapid succession) are exactly the ones where `beforeinput` ranges/`data` are
unreliable — which is why PM refuses to trust them and reads the DOM instead. We
cannot match PM by adding more `beforeinput` heuristics; we must read the DOM.

Like PM, we read with a `MutationObserver` and dispatch transactions **live**
throughout the composition. The one change from PM is _what the observer
watches_: instead of the whole editable DOM, we scope it to the **frozen
composing region**. Because React provably never writes into the frozen region
(see §1), every record that observer produces is IME-origin — so there is
nothing to "bracket." Summary:

> **Protect the composing region with a render-level freeze (no-op commits by
> construction). Observe only that frozen region with a `MutationObserver`, and
> on each flush run PM's `parseBetween` + `findDiff` to dispatch a live,
> composition-tagged transaction — exactly as `readDOMChange` does today, just
> pointed at the freeze root.**

## Why a whole-document observer doesn't work (and a region-scoped one does)

The naive port of PM keeps a `MutationObserver` on the **entire** editable DOM.
That forces us to stop the observer before every React commit and restart after,
so React's own writes aren't misread as input. **That bracketing is not
achievable**, because react-prosemirror has commit paths we don't own and can't
wrap:

- **Controlled mode**: a parent re-rendering `<ProseMirror state={…}>` drives a
  render through React's normal batched/async path — it never goes through
  `view.dispatch`/`flushSync`.
- **User node views**: arbitrary local `setState` at any time, even when PM
  state is unchanged.

There is no general React hook that runs immediately before/after an _arbitrary_
commit (`getSnapshotBeforeUpdate` + a layout effect only bracket a single
component's own update, and don't fire when a deep descendant commits on its
own). So wrapping `flushSync` — or any single call site — cannot cover every
commit.

The fix is not to drop the observer but to **shrink what it watches**. The
bracketing problem only exists for regions React writes to. The composing region
is frozen, so React never writes there during the composition window — a
`MutationObserver` scoped to the freeze root therefore records IME mutations
only, and needs no bracketing. Everything React _does_ write (other blocks,
controlled updates, node-view chrome) is outside the observed subtree and
invisible to it.

## The model

### 1. Protect by render-level freeze

Protection lives **inside the render output** of react-prosemirror's own content
components — the generalization of today's `TextNodeView.renderRef` trick. While
`view.composing` and a component is the root of the composing region, its
`render()` returns the **same element reference** as the previous render.
React's reconciler bails out on a referentially-equal element and writes nothing
into that subtree's DOM.

The load-bearing property: **this is correct no matter when or why React
commits.** A controlled-prop change, a user node-view `setState`, or a scheduler
flush will all still _render_, but our components emit identical output, so the
reconciler produces an empty diff over the composing region. We never need to
know when a commit happens, because the commit is a no-op _there_ by
construction. (This is already proven in the codebase: `TextNodeView` does
exactly this for one text node — we lift it to the composing-region root.)

Everything **outside** the frozen region renders normally. Because the observer
watches only the frozen subtree (§2), React committing elsewhere (the "change
elsewhere" test, a controlled update, a node view animating itself) is just
ordinary React work — outside the observed subtree, invisible to it. The only
invariant is "React must not write into the frozen region," which the freeze
guarantees.

### 2. Read the IME result live, via a region-scoped observer

This is PM's model, scoped down. At `compositionstart`, after the inline-context
setup commits (cursor wrapper, etc.) and the freeze is in place, start a
`MutationObserver` on the **freeze root**
(`observe(freezeRootDOM, {subtree, characterData, childList, ...})`). On each
flush, run PM's pipeline essentially verbatim — only the observed element
differs from `view.dom`:

1. `registerMutation` → derive the changed `from`/`to` (and expand to
   shared-depth boundaries, `domchange.ts:102-105`).
2. `parseBetween` over the (IME-mutated) DOM.
3. `findDiff` against the doc slice; build and **dispatch live** a transaction
   tagged `setMeta("composition", compositionID)`, mirroring `readDOMChange`'s
   insert/delete/mark/Enter/Backspace cascade.

So `view.state` tracks the DOM throughout the composition, exactly like PM, and
plugins (decorations, collab) see incremental changes. Each dispatch re-renders,
but the freeze root bails out → no DOM write into the IME's region → no spurious
records. The freeze and live dispatch coexist: state goes live while the DOM
stays the IME's; the divergence is reconciled by the remount at the end (§5).

At `compositionend` (plus PM's `compositionPendingChanges` microtask flush) we
do **only** a final flush of any pending records, then stop the observer and
remount (§5). The bulk of the work has already happened live.

Reusing the base `DOMObserver`/`readDOMChange` is feasible because
react-prosemirror's view descs already implement everything they call
(`parseRange`, `parseRule`, `markDirty`, `nearestDesc`, `localPosFromDOM`,
`domAtPos`). The main adaptation is pointing `observe()` at the freeze root and
only running during the composition window.

### 3. Maintain the freeze root's desc subtree imperatively

This is the consequence of §1 + §2 that the rest of the model depends on. The
view desc tree in react-prosemirror is a **byproduct of React rendering** — each
node/text/mark component builds and updates its `ViewDesc` in layout effects
that run _after_ React commits the DOM. Freezing React (§1) therefore freezes
the desc tree: no re-render → no effects → no desc updates. But §2's live
dispatches move `view.state` forward on every keystroke, and
`readDOMChange`/`parseBetween` resolve positions against **current**
`view.state` and walk the desc tree's `.children` by position. A frozen (stale)
desc subtree would feed the next flush a wrong range.

React can't help here: render and commit are coupled, so we can't update the
desc tree (effects) without also committing DOM from state — which would clobber
exactly the nodes the IME is mutating. So **during the composition window we own
the freeze root's desc subtree imperatively**, mirroring PM's
`updateChildren`/`protectLocalComposition`:

- On each dispatch (composition _or_ a non-cancelling external change), an
  imperative sync repositions the descs under the freeze root from the live
  state and resizes/repositions the `CompositionViewDesc` that represents the
  IME DOM — **without touching the DOM** (no `renderDescs`; React stays frozen
  there).
- React keeps owning the desc tree everywhere outside the freeze root, and
  everywhere once composition ends.
- At `compositionend` the remount (§5) hands the region back to React, which
  rebuilds descs from canonical state via its normal effects.

**Impedance mismatch to resolve.** react-prosemirror positions descs via
`getPos` **closures** tied to React render data; PM computes positions by
walking `parent.children` and summing sizes. The frozen subtree's descs must
compute positions from an imperatively-maintained base during composition rather
than from their now-stale closures. Concretely, the imperative sync needs a
position-recompute path for the frozen subtree that doesn't depend on a React
re-render — e.g. a PM-style `posBeforeChild` walk rooted at the freeze root's
(still-valid) start position. This is the fiddliest part of the whole effort and
should be pinned down with the synthetic test before relying on it.

### 4. Cancellation via overlap detection

When an external change lands during composition (a `dispatch` **or** a new
`state` prop), decide continue-vs-cancel with PM's existing criterion, already
ported in `viewdesc.ts`: re-run `localCompositionInfo` / `findTextInFragment`
for the frozen region against the new state. Because we dispatch live, the
composition text _is_ in state, so this check works exactly as PM's does — no
range-intersection reimplementation needed.

- **No overlap** → composition continues; the change renders in non-frozen
  regions normally. (Test: "doesn't cancel when a change happens elsewhere.")
- **Overlap** → drop the freeze and rebuild the region from the new state,
  abandoning the in-DOM composition. (Tests: full / partial / inside overlap.)

### 5. Resync via remount

After the final flush, the frozen subtree's React fiber still holds host
instances pointing at IME-mutated DOM (composed text, merged blocks). Letting
React diff its stale virtual DOM against the new state and patch the IME DOM is
the crash we keep hitting. Instead, **mint a new React key for the frozen
subtree's root** so React discards the old fiber and builds fresh from canonical
state — the `RemountableTextNodeView`/`forceRemount` trick, lifted to the region
root. Restore the DOM selection afterward (`selectionToDOM` /
`docView.setSelection`). The contenteditable host itself (in `DocNodeView`) is
never remounted, so focus stays in the editor.

## Freeze granularity (incl. cross-paragraph)

The freeze root is the React component for the **lowest common block ancestor of
the composing range's endpoints**, computed at `compositionstart`:

```
const { from, to } = view.state.selection         // collapsed → from === to
const $from = state.doc.resolve(from)
const sharedDepth = $from.sharedDepth(to)
const freezeRoot = $from.node(sharedDepth)         // node whose NodeView freezes
// parse/read range, identical to readDOMChange:
const $before = state.doc.resolve(from)
const parseFrom = $before.before(sharedDepth + 1)
const parseTo  = state.doc.resolve(to).after(sharedDepth + 1)
```

- **Within one textblock** (the common case): `sharedDepth` is the textblock's
  depth, so the freeze root is that textblock. Only it freezes; the rest of the
  doc renders normally. Freezing the textblock root is enough — its descendants
  never re-reconcile once the root returns a cached element.
- **Cross-paragraph selection** (PM's `cross-paragraph` test, which starts from
  a selection spanning three paragraphs): `sharedDepth` is shallower — the
  common container (often the doc) — so the freeze root is that ancestor and
  covers every spanned paragraph. The IME merges those paragraphs in the DOM;
  React touches none of them; the read parses the whole span and diffs to the
  final single paragraph. Over-freezing here is acceptable: it only defers
  painting of unrelated regions for the brief composition window.

Only the freeze **root** must return a cached element; bailout cascades to its
descendants. (Caveat: a user node view _inside_ the frozen root can still commit
its own chrome via its own `setState` — React processes per-fiber updates even
under a bailed-out parent — but its PM **content** is rendered by our frozen
components and stays protected. This matches PM's stance on custom node views.)

**Known weak spot — late expansion past the freeze root.** A _collapsed_-cursor
composition that later grows across a block boundary the IME deletes (the
contrived second cross-paragraph variant) can reach DOM outside the freeze root
chosen at start — and outside the observed subtree. Options, in increasing cost:
(a) accept as a known limitation (PM itself is fragile here; the react test is
commented out and synthetic); (b) widen the freeze root one block level for
collapsed compositions; (c) when the region-scoped observer reports the IME
reaching the edge of the freeze root, widen the freeze + re-`observe()` the
wider root. Defer to a later phase.

## Component-level changes

Keep / lift:

- The base `DOMObserver` / `readDOMChange` machinery (`parseBetween`,
  `findDiff`, `registerMutation`) — reused as-is, but `observe()`d on the freeze
  root and only during the composition window.
- `CompositionViewDesc`, `findTextInFragment` (`viewdesc.ts`) — used by position
  accounting and the overlap/cancel check.
- `RemountableTextNodeView` / `forceRemount` — generalize to region remount.
- `CursorWrapper`, the gap-cursor hack, empty-textblock `[]` marks — inline
  context setup at `compositionstart` (largely unchanged).
- `TrailingHackView`'s `<br>` removal/reinsert — still needed so browsers don't
  mangle composition in empty/trailing positions.

Replace:

- The per-text-node `shouldProtect` guessing (`containsCompositionNodeText`,
  `wasProtecting`, `displacedNodes`, the detach/reattach in
  `handleCompositionEnd`) → a single region-level freeze keyed off the
  `compositionstart` range.
- `beforeInputPlugin`'s composition branches (`insertCompositionText`,
  `deleteCompositionText`, `insertFromComposition`) and the deferred-`input`
  dispatch → the region-scoped observer + `readDOMChange`. `beforeInputPlugin`
  should **early-return for all `beforeinput` while composing** and not
  `preventDefault`, so the browser is free to mutate the frozen DOM.

Add:

- A composition controller (likely on `ReactEditorView`) holding the freeze
  range, `compositionID`, the region-scoped observer lifecycle, and the
  `compositionend` final-flush + remount sequence.

Keep the **whole-document** `MutationObserver` disabled, as today (ordinary
editing still goes through `beforeInputPlugin`). The observer is enabled only on
the freeze root, only between `compositionstart` and the post-`compositionend`
flush.

## Implementation phases

Each phase keeps the suite green and unlocks specific tests.

1. **Region freeze.** Replace per-text-node protection with a freeze rooted at
   the `compositionstart` shared-depth ancestor (within-textblock granularity
   first). Re-run the currently-passing tests; they should stay green with
   simpler internals.

2. **Live region-scoped read.** Start a `MutationObserver` on the freeze root at
   `compositionstart`; on each flush run `readDOMChange` and dispatch live,
   composition-tagged transactions. Remove the `beforeinput` composition
   branches and make the plugin early-return while composing. Initially run
   against the minimal-maintenance cut (Phase 3 not yet done): single composing
   text node, positions stable before it.

3. **Imperative desc maintenance (§3).** On each dispatch during composition,
   run the imperative sync that repositions the freeze root's desc subtree from
   live state and resizes the `CompositionViewDesc`, without touching the DOM.
   Build the position-recompute path that doesn't depend on a React re-render
   (PM-style `posBeforeChild` walk rooted at the freeze root). This is what
   makes live dispatch correct beyond the trivial cases. _Targets
   cross-paragraph (selection variant) and rapid succession._

4. **End-of-composition resync.** `compositionend` final flush (port PM's
   `compositionPendingChanges` microtask), stop the observer, bump
   `compositionID`, remount the region (§5), re-assert selection.

5. **Cancellation.** Wire `localCompositionInfo`/`findTextInFragment` overlap
   detection to external dispatches and controlled-prop updates; drop-freeze +
   rebuild on overlap. (Works against live state, since §2 dispatches live.)
   _Unlocks partial / inside / full overlap cancel._

6. **Selection.** Revisit the `onSelectionChange` no-op. The region-scoped
   observer's own `onSelectionChange` only fires for the frozen subtree; ensure
   we assert a DOM selection only at boundaries (start setup, end resync) to
   avoid the Safari composition abort. Validate on Safari/Chrome/Firefox.

7. **Browser workarounds & late-expansion.** Re-introduce the PM workarounds
   that matter (Safari Enter-after-`compositionend` swallow via
   `inOrNearComposition`, Android timeout/enter-pick, bad-Safari table cell,
   Gecko/Chrome stray `<br>`), and decide on the late-expansion option (a/b/c
   above), guided by failing tests.

8. **Cleanup.** Delete dead flags and obsolete protection machinery; update
   docs.

## Risks / open questions

- **Imperative desc maintenance (§3) is the riskiest piece.** Keeping the frozen
  subtree's positions correct from live state without a React re-render — across
  the `getPos`-closure vs. parent-walk mismatch — is the make-or-break detail.
  De-risk it with the synthetic test (multi-step composition + a
  position-shifting event) before building on it.
- **Freeze granularity vs. late expansion.** The collapsed-cursor cross-block
  case (above) is the main correctness gap; pick option a/b/c in Phase 7.
- **Remount focus/selection.** Remounting region content while focused must not
  blur the editor or drop the caret; the host stays mounted and we re-assert
  selection after the commit. Validate carefully.
- **`commitPendingEffects` → base `updateStateInner`.** It still runs PM's own
  composition-protection path. Confirm a single owner of protection (React
  freeze for rendering; PM descs only for position accounting) and that the base
  `updateStateInner`'s own `domObserver.stop()/start()` doesn't fight the
  region-scoped observer's lifecycle.
- **Observed-subtree purity.** The region-scoped observer assumes React never
  writes into the freeze root. A user node view _inside_ the root committing its
  own chrome would land in the observed subtree; this is the same situation PM
  is in, handled by `desc.ignoreMutation` in `registerMutation` — verify our
  descs honor it.
- **Reading mutated DOM accurately.** `parseBetween` must tolerate whatever the
  IME left (stray `<br>`, merged blocks). PM's `ruleFromNode` handles much of
  this; verify it behaves against react-prosemirror's view descs.
- **Selection-reassert aborting composition on Safari.** Most empirically
  fiddly; keep Phase 4 isolated and reversible.

## Test strategy

- Keep the existing BiDi IME tests; uncomment the four hard cases as phases
  land.
- Add a synthetic unit test that drives the read path directly: mutate a frozen
  block's DOM text, trigger an observer flush, assert the dispatched transaction
  — fast, browser-IME-free feedback for the core algorithm.
- Cross-check each ported behavior against the corresponding PM test in
  `../prosemirror-view/test/webtest-composition.ts`.
