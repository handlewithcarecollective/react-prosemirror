# How Slate handles IME composition

Files referenced are in `/home/smoores/code/slate/packages/slate-react/src`
(plus some shared helpers in `slate-dom`).

Slate is the other major React-based rich text editor, so it faces the same core
problem react-prosemirror does: React believes it owns the contenteditable DOM,
but the browser (typing, IME) mutates it out from under React. Slate's answer is
strikingly different from both prosemirror-view and react-prosemirror, and the
central trick is worth internalizing.

## The central trick: text lives _outside_ React's virtual DOM

This is the thing that makes everything else simpler, and it's the biggest
departure from react-prosemirror.

`TextString` (`components/string.tsx`) renders a leaf's text like this:

```tsx
const TextString = ({ text, isTrailing }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const getTextContent = () => `${text ?? ""}${isTrailing ? "\n" : ""}`;
  const [initialText] = useState(getTextContent); // captured once, at mount

  useIsomorphicLayoutEffect(() => {
    // runs on *every* render
    const textWithTrailing = getTextContent();
    if (ref.current && ref.current.textContent !== textWithTrailing) {
      ref.current.textContent = textWithTrailing; // imperative, diff vs real DOM
    }
  });

  return <MemoizedText ref={ref}>{initialText}</MemoizedText>; // memo'd
};

const MemoizedText = memo(
  forwardRef((props, ref) => (
    <span data-slate-string ref={ref}>
      {props.children}
    </span>
  ))
);
```

The comment in the source says it outright:

> The text is not rendered as part of the virtual DOM... What we need here is
> not reconciliation and diffing with previous version of the virtual DOM, but
> rather diffing with the actual DOM element, and replace the DOM `<span>`
> content exactly if and only if its current content does not match our current
> virtual DOM. Otherwise the DOM TextNode would always be replaced by React as
> the user types, which interferes with native text features...

So:

- The `<span>` is **memoized** and only ever receives `initialText` (a
  `useState` snapshot). React renders the text child once, at mount, and then
  **never re-renders that span** — its props never change.
- The actual text content is maintained **imperatively** in a layout effect that
  compares the model's text to the _real DOM's_ `textContent` and writes only
  when they differ.

The consequence for composition is enormous: **React's reconciler never owns or
overwrites text content.** When the IME mutates a text node during composition,
React doesn't know and doesn't care — that span has no live text child in the
vdom. On the next render after composition, the layout effect compares the
model's (now-updated) text to the DOM's (IME-written) text; they're equal, so it
writes nothing and the IME's own text node is preserved.

react-prosemirror, by contrast, renders text _as a React child_ (`TextNodeView`
returns the text), so React's reconciler does fight the browser — which is the
entire reason react-prosemirror needs the freeze + protect + remount machinery.
Slate sidesteps that whole category of problem by taking text out of the vdom.

What this does _not_ cover is **structural** DOM mutation (nodes added/removed)
— React still owns element structure. That's where Slate's two platform paths
diverge.

## Two paths: non-Android vs Android

`RestoreDOM` (`components/restore-dom/restore-dom.tsx`) is gated:

```tsx
export const RestoreDOM = IS_ANDROID
  ? RestoreDOMComponent
  : ({ children }) => <>{children}</>;
```

So the MutationObserver-based machinery below is **Android-only**. On every
other browser, Slate has _no_ MutationObserver; it relies on `beforeinput` +
composition events.

## Non-Android composition lifecycle (`components/editable.tsx`)

Slate keeps an `isComposing` flag (React state + an `IS_COMPOSING` weakmap +
`ComposingContext`).

### compositionstart

```tsx
setIsComposing(true);
const { selection } = editor;
if (selection && Range.isExpanded(selection)) {
  Editor.deleteFragment(editor); // collapse the selection up front
  return;
}
```

**This is the key move for the range-replacement cases we've been fighting.** If
the selection is expanded — including a selection that spans multiple marks or
the whole block — Slate **deletes it synchronously at compositionstart**, before
the IME composes anything. The composition then always happens at a _collapsed_
cursor in a single text run. There is never a "composition that restructures
multiple slices," because the multi-slice content is already gone by the time
composition begins. (This is exactly the select-all / multi-mark case that
breaks react-prosemirror's single-slice sync — Slate avoids it by construction.)

### during composition

In `onDOMBeforeInput`:

```tsx
const isCompositionChange =
  type === "insertCompositionText" || type === "deleteCompositionText";
if (isCompositionChange && ReactEditor.isComposing(editor)) {
  return; // ignore — touch neither the model nor preventDefault
}
```

So while composing, Slate **does nothing** with composition `beforeinput`
events. The model is not updated; the IME freely mutates the span's text content
(which, per the central trick, React doesn't manage anyway). No live dispatch,
no DOM reading, no desc bookkeeping. The model is frozen for the duration.

### compositionend

```tsx
Promise.resolve().then(() => {
  setIsComposing(false);
  IS_COMPOSING.set(editor, false);
});
// ... then, for Chrome-family browsers (not WebKit/Firefox-legacy/iOS/...):
if (event.data) {
  // apply the marks the user was seeing (pending-insertion-marks dance)
  Editor.insertText(editor, event.data);
}
```

The composed text is committed from **`event.data`** (the composition's final
string), _not_ by reading the DOM. `Editor.insertText` updates the model → React
re-renders → the `TextString` layout effect compares model text to DOM text.
Because the IME already wrote the composed text into the span and the model now
matches, the effect writes nothing — the IME's text node survives untouched.

So the non-Android strategy is essentially **read-nothing-incrementally,
commit-the-final-string-at-end**, made safe by out-of-vdom text:

- collapse expanded selections at start → composition is always a simple insert;
- ignore composition input while composing → model frozen, IME owns the DOM;
- on end, `insertText(event.data)` → model catches up, text node preserved.

The per-browser `if` (excluding WebKit/Firefox/iOS/etc.) exists because those
browsers _do_ fire usable `beforeinput`/`input` for composition and go through
the normal input path; only Chrome-family needs the compositionend `event.data`
fallback (Chrome never fires `insertFromComposition`).

## Android path: RestoreDOM + the input manager

Android's IME and `beforeinput` are notoriously unreliable (non-cancelable
events, missing/lying inputTypes, structural DOM surgery), so Slate has a whole
subsystem.

### RestoreDOM (`restore-dom-manager.ts`, `restore-dom.tsx`)

A class component (needed for `getSnapshotBeforeUpdate`) wraps the editable
content and runs a `MutationObserver` over it. The flow:

```tsx
getSnapshotBeforeUpdate() {
  const pending = this.mutationObserver?.takeRecords()
  if (pending?.length) this.manager?.registerMutations(pending)
  this.mutationObserver?.disconnect()
  this.manager?.restoreDOM()   // <-- revert the browser's mutations
  return null
}
componentDidUpdate() { this.manager?.clear(); this.observe() }
```

`restoreDOM()` **reverts** the buffered mutations — re-inserting removed nodes,
removing added nodes — so that, right before React commits its update, the DOM
is back to the shape React's vdom expects. React then reconciles against a DOM
it recognizes (no crash), and the model-driven update paints correctly.

Two details that mirror lessons from our own work:

- It runs in **`getSnapshotBeforeUpdate`** — the one React hook that runs
  synchronously _before_ the commit/mutation phase. (This is the "bracket
  React's commit" primitive we discussed; Slate uses it for a single wrapping
  component.)
- It **deliberately does not restore `characterData` mutations**: _"We don't
  want to restore the DOM for characterData mutations because this interrupts
  the composition."_ So only **structural** (childList) mutations are reverted;
  text edits are left for the imperative `TextString` diff to reconcile. This is
  the same split as the central trick: characterData is React-tolerable (it's
  out-of-vdom anyway), structural mutation is what must be undone.

### android-input-manager (`hooks/android-input-manager/android-input-manager.ts`)

A ~600-line state machine that turns Android's unreliable signals into model
edits. High-level shape:

- Maintains **pending diffs** (`StringDiff`/`TextDiff`) per text node and a
  pending action/selection, in weakmaps (`EDITOR_TO_PENDING_DIFFS`, etc.).
- `handleDOMBeforeInput` records intent rather than applying it (Android
  `beforeinput` isn't cancelable), accumulating diffs.
- `flush()` (debounced via `FLUSH_DELAY` / `RESOLVE_DELAY`) reconciles the
  accumulated diffs into the model with `applyStringDiff`/`Editor.insertText`,
  verifies state (`verifyDiffState`), and reconnects.
- `handleCompositionStart`/`handleCompositionEnd` integrate with the flush
  scheduling rather than inserting directly.

The takeaway: on Android, Slate gives up on interpreting events live and instead
**diffs DOM text against the model on a timer**, applying the net change —
closer to prosemirror-view's read-the-DOM model than to its own non-Android
path, but buffered and debounced because Android lies about timing.

## Selection during composition

Like PM and react-prosemirror, Slate is careful with selection during
composition. Several spots gate on `ReactEditor.isComposing(editor)`:

- the DOM-selection-change handler bails while composing on non-Android
  (`editable.tsx:469`,
  `if (ReactEditor.isComposing(editor) && !IS_ANDROID) return`);
- the React-managed selection sync skips while composing (`:283`, `:319`);
- a `keydown` guard clears `isComposing` when
  `nativeEvent.isComposing === false` (`:1568`) to recover from browsers that
  don't fire a clean `compositionend`.

## How the three editors compare

|                          | prosemirror-view                                                      | react-prosemirror                                                          | Slate                                                                      |
| ------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Text rendering           | imperative view descs                                                 | **React children**                                                         | **imperative `<span>` textContent** (out of vdom)                          |
| Input model              | observe DOM → `readDOMChange` diff                                    | intercept `beforeinput`                                                    | intercept `beforeinput`                                                    |
| During composition       | observe + protect composing node (`CompositionViewDesc`), redraw rest | freeze region, observe scoped, live `readDOMChange` + imperative desc sync | **ignore composition input; model frozen; IME owns DOM**                   |
| Commit                   | observer flush → diff                                                 | observer flush → diff                                                      | **`event.data` at compositionend** (Chrome); native input elsewhere        |
| Range replacement        | diffed naturally                                                      | (currently broken — single-slice sync)                                     | **delete selection at compositionstart → always collapsed**                |
| React-vs-DOM conflict    | n/a (no React)                                                        | freeze + remount                                                           | **text out of vdom**; structural mutation reverted (Android) or rare       |
| Cross-block / multi-mark | diffed naturally                                                      | unsolved                                                                   | collapse-at-start avoids it; structure is React-managed + Android-reverted |

## Lessons relevant to react-prosemirror

1. **The freeze fights a problem Slate doesn't have.** Almost all of our
   composition pain — freeze, protect, displaced slices, imperative desc
   maintenance — exists because text is a React child that the reconciler
   overwrites. Slate renders text as an out-of-vdom `<span>` with imperative
   `textContent` diffing, so React never fights the browser over text. Adopting
   that model (text not as React children) would dissolve most of our machinery.
   It's a deep change to how `TextNodeView` renders, but it's the
   highest-leverage idea here.

2. **Delete expanded selections at compositionstart.** This is a cheap,
   self-contained fix for exactly the multi-mark / select-all /
   range-replacement cases that break our single-slice sync. If the selection is
   expanded when composition starts, delete it first so the composition is
   always a collapsed insertion. We could adopt this independently of anything
   else.

3. **"Ignore composition input, commit `event.data` at the end" is read-at-end,
   validated.** Slate's non-Android path is exactly the read-at-end strategy we
   were weighing — and it ships it as the _primary_ path, not a fallback. The
   cost (no live model updates mid-composition) is one Slate simply accepts.
   That it works for a widely-used editor is evidence the live-dispatch
   requirement may be stricter than necessary — at least the "live" benefit is
   smaller than it seems if Slate doesn't bother.

4. **`getSnapshotBeforeUpdate` is the legitimate pre-commit hook** — Slate uses
   it for the Android RestoreDOM, confirming it's the right primitive when you
   do need to run code synchronously before React's mutation phase (for a
   wrapping class component you control).

5. **Reverting structural mutations (RestoreDOM) is an alternative to
   freezing.** Instead of preventing React from touching the composing region,
   Slate (on Android) lets the browser mutate, then _undoes_ the structural
   mutations before React commits, so React reconciles against a DOM it
   recognizes. That's a different answer to the same crash than our freeze — and
   notably it also exempts `characterData`, same as our composing-node
   protection.
