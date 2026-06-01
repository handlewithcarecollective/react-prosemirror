# How react-prosemirror currently handles IME composition

Files referenced are in `./src`.

## The fundamental difference from prosemirror-view

react-prosemirror renders the **entire** ProseMirror document with React. React
believes it owns every node in the contenteditable subtree and will, on its next
reconciliation, try to patch the real DOM to match its virtual DOM.

Because of that, react-prosemirror **abandons prosemirror-view's
observe-and-reconcile model**:

- In the `ReactEditorView` constructor (`ReactEditorView.ts:128`) the native
  `MutationObserver` is torn down (`domObserver.stop()`,
  `domObserver.observer = null`, `queue = []`). So `readDOMChange` essentially
  **never runs** for ordinary input.
- `domObserver.onSelectionChange` is wrapped to **no-op while `view.composing`**
  (`ReactEditorView.ts:132`) — "compositions are fragile; even re-asserting the
  same selection ends them on Safari."
- Input is instead intercepted at the `beforeinput` event by `beforeInputPlugin`
  (`plugins/beforeInputPlugin.ts`), which builds transactions directly from the
  event's `inputType`, `data`, and `getTargetRanges()`.

So where prosemirror-view says "let the DOM change, then read it," react-
prosemirror says "intercept the intent, never let the DOM diverge from React."
Composition is where that inversion hurts, because the IME mutates DOM that
React thinks it owns, and React crashes (or silently writes into detached nodes)
on the next render.

## Rendering / commit pipeline (context)

- `useEditor` (`hooks/useEditor.ts`) holds React state, dispatches via
  `flushSync`, and after every render runs `view.commitPendingEffects()` in a
  layout effect.
- `commitPendingEffects` (`ReactEditorView.ts:286`) rolls `state` back to the
  previous value, `docView.markDirty(-1, -1)`, then calls base
  `EditorView.update` so the base class validates the DOM selection and runs
  plugin/nodeview selection callbacks. (This still drives base
  `updateStateInner`, which contains PM's own composition-protection code.)
- `useEditor` also registers
  `view.dom.addEventListener("compositionend", forceUpdate)` to force a
  re-render after composition.

## Composition lifecycle today

### compositionstart (`beforeInputPlugin.ts:90`)

1. `view.compositionStarting = true`.
2. Compute `compositionMarks` = `storedMarks`, or `[]` if starting in an empty
   textblock (so the browser doesn't inject a stray `<br>`).
3. Clear stored marks; run `handleGapCursorComposition` (creates an inline
   context if a gap cursor is active — the prosemirror-gapcursor hack run
   early).
4. If `compositionMarks`, dispatch a `CursorWrapper` widget through the
   `reactKeys` plugin meta. Otherwise, if the selection is empty, pin the DOM
   cursor to PM's canonical position with
   `docView.setSelection(..., force=true)` wrapped in
   `disconnectSelection`/`connectSelection`.
5. `compositionStarting = false`, then `view.input.composing = true` (set last
   so existing text nodes don't try to protect themselves while the cursor
   wrapper is being created).

### compositionupdate — no-op (returns true).

### beforeinput during composition (`beforeInputPlugin.ts:214`)

`insertCompositionText` / `deleteCompositionText` / `insertFromComposition`:

- Read `getTargetRanges()[0]` → `start`/`end` PM positions via `posAtDOM`.
- If the doc text already equals `event.data`, bail.
- Build a `tr` that `insertText(event.data, ...)` (ensuring `compositionMarks`)
  or `delete(...)`.
- If composing at the very start of a text node with matching marks, tell the
  `reactKeys` plugin to keep the node's key (`overrides`) so React doesn't
  remount.
- **Defer** `view.dispatch(tr)` to the next `input` event
  (`addEventListener("input", …, {once:true})`), capturing
  `view.input.compositionNode` from the DOM selection at that point. The
  deferral lets the browser finish mutating the DOM before React reconciles.

### compositionend (`beforeInputPlugin.ts:165`)

1. `composing = false`; clear `compositionMarks`.
2. **Restore displaced nodes** (`view.displacedNodes`): push each back into its
   parent's `children`, restore `dom.pmViewDesc`, and truncate the IME text node
   back to the PM node's claimed text (the composed content lives in PM state
   and will be re-rendered by React).
3. Dispatch to remove the cursor wrapper.
4. Remove the orphaned IME composition node if it is detached.
5. Reset `compositionNode`, `compositionNodes`, bump `compositionID`.

The separate `compositionend → forceUpdate` listener in `useEditor` triggers a
re-render so React resyncs.

## How the composing DOM is protected from React

This is the analog of prosemirror-view's `protectLocalComposition`, but it has
to happen at the React-component level:

- **`TextNodeView`** (`components/TextNodeView.tsx`):

  - `shouldProtect()` (≈ `localCompositionInfo`): true when composing and either
    this node's DOM **is** `view.input.compositionNode`, or the selection is
    inside this node and `findTextInFragment` confirms the IME text still fits
    the PM content (`containsCompositionNodeText`).
  - `render()` returns the cached `renderRef` while protecting, so the
    reconciler sees no change and leaves the DOM alone. `wasProtecting` tracks
    the edge.
  - `update()` refuses to destroy/recreate the desc while it owns the
    composition node, so a later `findCompositionDOM` pass can displace it
    cleanly.
  - `handleCompositionEnd()`: if the IME detached this node's DOM, re-attach the
    orphan at the right position and `forceRemount()` (mint a new key → fresh
    fiber) so React rebuilds instead of diffing a stale tree;
    `RemountableTextNodeView` provides that key-bump.

- **`CompositionViewDesc` + `findCompositionDOM`** (`viewdesc.ts:728`,
  `hooks/useNodeViewDescription.ts:206`, `hooks/useMarkViewDescription.ts:167`):
  when a composing text node appears that the `TextNodeView` cannot locate
  (newly created node) or when the IME extended an existing tracked text node,
  the parent node/mark view locates the orphaned DOM (a `contentDOM` child not
  matched by any tracked child, or the extended text node) and binds it to a
  `CompositionViewDesc`, **displacing** the original `TextViewDesc` into
  `view.displacedNodes` and removing it from the sibling list so position
  accounting stays correct.

- **`TrailingHackView`** (`components/TrailingHackView.tsx`): on
  `compositionstart` it unmounts itself _before_ the browser deletes the
  trailing `<br>`, then re-inserts a raw (React-unmanaged) `<br>` so
  Chrome/Safari don't mangle the composition; restores on `compositionend`. Also
  runs the same check on mount via `compositionStarting` (in case it mounted in
  the same batch).

- **`CursorWrapper`** (`components/CursorWrapper.tsx`): an `<img>` separator
  widget that pins the DOM selection (disconnect/collapse/connect) for
  composition in marks / empty blocks.

## State carried for composition

`ReactEditorView` declares an `input` shape mirroring PM's, plus extras:
`compositionStarting: boolean` and `displacedNodes: TextViewDesc[]`.
`TextNodeView` keeps `wasProtecting` and `containsCompositionNodeText` refs.

## Current test status (`components/__tests__/ProseMirror.composition.test.tsx`)

Tests drive **real** IME events through WebdriverIO BiDi
(`browser.imeSetComposition` / `imeInsertText`), unlike PM's synthetic-event
tests. Passing/uncommented:

- empty block; end of block; inside existing text; word replacement; inside
  marks; multi-child marks; cursor wrapper; multi-child mark + cursor wrapper;
  decoration changes; highlighted text; spanning multiple nodes; not overwriting
  widgets; cancel on full overlap; not cancelling on change elsewhere.

**Commented out / not yet handled** (the hard cases that prosemirror-view
passes):

- cancel composition on **partial** overlap (`:477`).
- cancel composition on **inside** overlap (`:490`).
- **rapid successive** compositions (`:532`).
- **cross-paragraph** composition, both variants (`:554`).

## Assessment

The current strategy is a large patchwork of special-case flags
(`compositionStarting`, `displacedNodes`, `containsCompositionNodeText`,
`wasProtecting`, key-override hints, deferred dispatch on `input`) layered onto
a `beforeinput`-driven model. It works for the common cases but:

- It re-derives the composed change from `beforeinput` target ranges/data, which
  is exactly what prosemirror-view deliberately refuses to trust because the
  data is inconsistent across browsers and IMEs — hence the unsolved
  cross-paragraph and rapid-succession cases.
- Cancellation is only partial because there is no single read-the-DOM reconcile
  step; the protection logic has to predict divergence instead of observing it.
- React reconciliation against IME-mutated DOM forces the fragile
  detach/reattach/remount dance in `TextNodeView` and `findCompositionDOM`.

Good news for a rewrite: react-prosemirror's `viewdesc.ts` is a faithful
reimplementation of prosemirror-view's view-desc hierarchy and **already
implements `parseRange`, `parseRule`, `markDirty`, `localPosFromDOM`,
`nearestDesc`, `findTextInFragment`, and `CompositionViewDesc`** — i.e. the
exact surface the base `readDOMChange`/`parseBetween`/`DOMObserver.flush`
machinery needs. That makes adopting prosemirror-view's model for composition
feasible.
