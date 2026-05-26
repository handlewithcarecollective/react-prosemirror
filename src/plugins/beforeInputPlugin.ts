import { Fragment, Mark, Slice } from "prosemirror-model";
import { Plugin, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

import { ReactEditorView } from "../ReactEditorView.js";
import { CursorWrapper } from "../components/CursorWrapper.js";
import { widget } from "../decorations/ReactWidgetType.js";
import { TextViewDesc, sortViewDescs } from "../viewdesc.js";

import { reactKeysPluginKey } from "./reactKeys.js";

function insertText(
  view: EditorView,
  eventData: string | null,
  options: {
    from?: number;
    to?: number;
    bust?: boolean;
    marks?: readonly Mark[] | null;
  } = {}
) {
  if (eventData === null) return false;

  const from = options.from ?? view.state.selection.from;
  const to = options.to ?? view.state.selection.to;

  if (
    view.someProp("handleTextInput", (f) =>
      f(view, from, to, eventData, () =>
        view.state.tr.insertText(eventData, from, to)
      )
    )
  ) {
    return true;
  }

  const { tr } = view.state;
  if (options.marks) tr.ensureMarks(options.marks);

  tr.insertText(eventData, from, to);

  view.dispatch(tr);
  return true;
}

// Taken from https://github.com/ProseMirror/prosemirror-gapcursor/blob/master/src/index.ts#L67-L84
// This is a hack that, when a composition starts while a gap cursor
// is active, quickly creates an inline context for the composition to
// happen in, to avoid it being aborted by the DOM selection being
// moved into a valid position.
//
// We can't rely on the actual hack from prosemirror-gapcursor, because
// it happens too late. We snapshot the DOM during compositionstart, but
// the gapcursor hack runs in beforeinput (after compositionstart).
function handleGapCursorComposition(view: EditorView) {
  // @ts-expect-error Internal property - jsonID
  if (!(view.state.selection.jsonID === "gapcursor")) {
    return;
  }
  const { $from } = view.state.selection;
  const insert = $from.parent
    .contentMatchAt($from.index())
    // All schemas _must_ have a text node type
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    .findWrapping(view.state.schema.nodes.text!);
  if (!insert) return;

  let fragment = Fragment.empty;
  for (let i = insert.length - 1; i >= 0; i--) {
    fragment = Fragment.from(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      insert[i]!.createAndFill(null, fragment)
    );
  }
  const tr = view.state.tr.replace(
    $from.pos,
    $from.pos,
    new Slice(fragment, 0, 0)
  );
  tr.setSelection(TextSelection.near(tr.doc.resolve($from.pos + 1)));
  view.dispatch(tr);
}

export function beforeInputPlugin() {
  let compositionMarks: readonly Mark[] | null = null;

  return new Plugin({
    props: {
      handleDOMEvents: {
        compositionstart(view) {
          if (!(view instanceof ReactEditorView)) return false;
          view.compositionStarting = true;

          const { state } = view;
          const { selection } = state;

          const isEmptyTr = state.tr.delete(selection.from, selection.to);

          const $from = isEmptyTr.doc.resolve(
            isEmptyTr.mapping.map(selection.from)
          );
          const isEmptyTextblock =
            $from.parent.isTextblock && $from.parent.childCount === 0;

          compositionMarks = view.state.storedMarks;
          // Render a CursorWrapper with empty marks if starting a composition in an
          // empty textblock with no marks. This prevents the browser from adding a
          // <br> to the text block when it becomes empty (either via canceling the
          // composition with the escape key or deleting all composition text when
          // the composition node is the only text node in the text block)
          if (compositionMarks === null && isEmptyTextblock) {
            compositionMarks = [];
          }

          const tr = view.state.tr.setStoredMarks(null);
          view.dispatch(tr);
          handleGapCursorComposition(view);

          if (compositionMarks) {
            view.dispatch(
              view.state.tr.setMeta(reactKeysPluginKey, {
                cursorWrapper: widget(state.selection.from, CursorWrapper, {
                  key: "cursor-wrapper",
                  marks: compositionMarks,
                  side: 0,
                  raw: true,
                }),
              })
            );
            // Pin the DOM cursor to PM's canonical position before the IME
            // captures wherever the browser happened to leave it. Without this,
            // a cursor at a mark boundary lands in either the left or right text
            // node depending on the user's last navigation direction, and the
            // IME composes into whichever one it found.
          } else if (view.state.selection.empty) {
            // @ts-expect-error internal method
            view.domObserver.disconnectSelection();
            try {
              view.docView.setSelection(
                view.state.selection.anchor,
                view.state.selection.head,
                view,
                true // force — skip the isEquivalentPosition early-return
              );
            } finally {
              // @ts-expect-error internal method
              view.domObserver.setCurSelection();
              // @ts-expect-error internal method
              view.domObserver.connectSelection();
            }
          }

          view.compositionStarting = false;
          // We set composing to true after creating the cursor wrapper
          // so that no existing text nodes try to protect themselves
          // while we're creating the cursor wrapper, which may need
          // to split a text node.
          view.input.composing = true;

          return true;
        },
        compositionupdate() {
          return true;
        },
        compositionend(view, event) {
          if (!(view instanceof ReactEditorView)) return false;

          if (!view.composing) return false;
          view.input.composing = false;

          compositionMarks = null;

          for (const displaced of view.displacedNodes) {
            // Put the displaced TextViewDesc back into its parent's child list.
            const parent = displaced.parent;
            if (parent && !parent.children.includes(displaced)) {
              parent.children.push(displaced);
              parent.children.sort(sortViewDescs);
            }

            // Restore pmViewDesc claim on the text node.
            displaced.dom.pmViewDesc = displaced;

            // Truncate the IME text node back to what the displaced PM node says it
            // is. The composed content lives in PM state; the next React render will
            // mount a sibling TextNodeView that inserts its own DOM (e.g.
            // `<span class="word">k</span>`) right after this node.
            const claimedText = displaced.node.text ?? "";
            if (displaced.nodeDOM.nodeValue !== claimedText) {
              displaced.nodeDOM.nodeValue = claimedText;
            }
          }

          view.dispatch(
            view.state.tr.setMeta(reactKeysPluginKey, {
              cursorWrapper: null,
            })
          );

          if (
            view.input.compositionNode &&
            isCompositionNodeOrphaned(view.input.compositionNode)
          ) {
            view.input.compositionNode.remove();
          }

          view.input.compositionEndedAt = event.timeStamp;
          view.input.compositionNode = null;
          view.input.compositionNodes = [];
          view.input.compositionID++;

          return true;
        },
        beforeinput(view, event) {
          if (event.inputType !== "insertFromComposition") {
            event.preventDefault();
          }
          switch (event.inputType) {
            case "insertParagraph":
            case "insertLineBreak": {
              // ProseMirror-view has a hack that runs the Enter event handlers
              // on iOS, to avoid a bug in Safari with calling event.preventDefault() on
              // Enter events.
              //
              // We want to prevent that hack, because we run the Enter event handlers
              // here, where there is no such bug. So we set this flag, which prosemirror-view
              // uses to check whether it should run the deferred event handlers.
              (view as ReactEditorView).input.lastIOSEnter = 0;

              // Fire a synthetic keydown event to trigger ProseMirror's keymap
              const keyEvent = new KeyboardEvent("keydown", {
                bubbles: true,
                cancelable: true,
                key: "Enter",
                code: "Enter",
                keyCode: 13,
                shiftKey: event.inputType === "insertLineBreak",
              });

              // Use someProp to directly call ProseMirror handlers
              return (
                view.someProp("handleKeyDown", (f) => f(view, keyEvent)) ??
                false
              );
            }
            case "insertReplacementText": {
              const ranges = event.getTargetRanges();
              event.dataTransfer?.items[0]?.getAsString((data) => {
                for (const range of ranges) {
                  const from = view.posAtDOM(
                    range.startContainer,
                    range.startOffset,
                    1
                  );
                  const to = view.posAtDOM(
                    range.endContainer,
                    range.endOffset,
                    1
                  );
                  insertText(view, data, { from, to });
                }
              });
              break;
            }
            case "insertText": {
              insertText(view, event.data);
              break;
            }
            case "insertCompositionText":
            case "deleteCompositionText":
            case "insertFromComposition": {
              if (!(view instanceof ReactEditorView)) break;

              const { tr } = view.state;

              // There's always a range on insertCompositionText beforeinput events
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              const range = event.getTargetRanges()[0]!;

              const start = view.posAtDOM(
                range.startContainer,
                range.startOffset
              );
              const end = view.posAtDOM(range.endContainer, range.endOffset, 1);

              if (
                view.state.doc.textBetween(start, end, "**", "*") === event.data
              ) {
                return;
              }

              if (event.data) {
                if (compositionMarks) tr.ensureMarks(compositionMarks);
                tr.insertText(event.data, start, end);
              } else {
                tr.delete(start, end);
              }

              // When updating a composition within an existing text node,
              // we need to avoid remounting it. If the composition is at
              // the very beginning of the text node, the start position of
              // that node will either be mapped forward (if inserting new
              // content) or deleted (if replacing existing content).
              //
              // This will cause the reactKeys plugin to mint a new key for
              // that node, which triggers a remount. So we check to see whether
              // we're working on a composition at the very beginning of a text
              // node, and if so, tell the react keys plugin not to change the
              // key for that node.
              //
              // We need to check that the marks are the same — if they're not,
              // then we're inserting text _before_ this text node, not at the
              // start of it, so we actually _do_ want to map the exsting node
              // forward.
              const $start = view.state.doc.resolve(start);
              const $end = view.state.doc.resolve(end);
              const marks = compositionMarks ?? $start.marksAcross($end) ?? [];
              if (
                $start.textOffset === 0 &&
                $end.nodeAfter?.marks.every((m) => m.isInSet(marks))
              ) {
                tr.setMeta(reactKeysPluginKey, {
                  overrides: { [start]: start },
                });
              }

              view.dom.addEventListener(
                "input",
                () => {
                  const sel = view.domSelectionRange();
                  if (sel.focusNode && sel.focusNode.nodeType === 3) {
                    view.input.compositionNode = sel.focusNode as Text;
                  }
                  view.dispatch(tr);
                },
                { once: true }
              );

              break;
            }
            case "deleteWordBackward":
            case "deleteHardLineBackward":
            case "deleteSoftLineBackward":
            case "deleteContentBackward":
            case "deleteWordForward":
            case "deleteHardLineForward":
            case "deleteSoftLineForward":
            case "deleteContentForward":
            case "deleteContent": {
              const targetRanges = event.getTargetRanges();
              const { tr } = view.state;
              for (const range of targetRanges) {
                const start = view.posAtDOM(
                  range.startContainer,
                  range.startOffset
                );
                const end = view.posAtDOM(range.endContainer, range.endOffset);
                const { doc } = view.state;

                const storedMarks = doc
                  .resolve(start)
                  .marksAcross(doc.resolve(end));

                tr.delete(start, end).setStoredMarks(storedMarks);
              }
              view.dispatch(tr);
              break;
            }
            default: {
              break;
            }
          }
          return true;
        },
      },
    },
  });
}
function isCompositionNodeOrphaned(tn: Text): boolean {
  if (tn.pmViewDesc) return false;
  for (
    let parent: Node | null = tn.parentNode;
    parent;
    parent = parent.parentNode
  ) {
    const desc = parent.pmViewDesc;
    if (desc instanceof TextViewDesc && desc.nodeDOM === tn) return false;
  }
  return true;
}
