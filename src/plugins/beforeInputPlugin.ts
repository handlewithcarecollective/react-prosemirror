import { Fragment, Mark, Slice } from "prosemirror-model";
import { Plugin, TextSelection } from "prosemirror-state";
import { Decoration, EditorView } from "prosemirror-view";

import { ReactEditorView } from "../ReactEditorView.js";
import { CursorWrapper } from "../components/CursorWrapper.js";
import { widget } from "../decorations/ReactWidgetType.js";
import { DOMNode } from "../dom.js";

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

export function beforeInputPlugin(
  setCursorWrapper: (deco: Decoration | null) => void
) {
  let compositionMarks: readonly Mark[] | null = null;
  let precompositionSnapshot: DOMNode[] | null = null;
  return new Plugin({
    props: {
      handleDOMEvents: {
        compositionstart(view) {
          compositionMarks =
            view.state.storedMarks ?? view.state.selection.$from.marks();

          view.dispatch(view.state.tr.deleteSelection());
          handleGapCursorComposition(view);

          const { state } = view;
          const $pos = state.selection.$from;

          if (compositionMarks) {
            setCursorWrapper(
              widget(state.selection.from, CursorWrapper, {
                key: "cursor-wrapper",
                marks: compositionMarks,
              })
            );
          }

          // Snapshot the siblings of the node that contains the
          // current cursor. We'll restore this later, so that React
          // doesn't panic about unknown DOM nodes.
          const { node: parent } = view.domAtPos($pos.pos);
          precompositionSnapshot = [];
          for (const node of parent.childNodes) {
            precompositionSnapshot.push(node);
          }

          // @ts-expect-error Internal property - input
          view.input.composing = true;
          return true;
        },
        compositionupdate() {
          return true;
        },
        compositionend(view, event) {
          // @ts-expect-error Internal property - input
          view.input.composing = false;

          const { state } = view;
          const { node: parent } = view.domAtPos(state.selection.from);

          if (precompositionSnapshot) {
            // Restore the snapshot of the parent node's children
            // from before the composition started. This gives us a
            // clean slate from which to dispatch our transaction
            // and trigger a React update.
            precompositionSnapshot.forEach((prevNode, i) => {
              if (parent.childNodes.length <= i) {
                parent.appendChild(prevNode);
                return;
              }
              parent.replaceChild(prevNode, parent.childNodes.item(i));
            });

            if (parent.childNodes.length > precompositionSnapshot.length) {
              for (
                let i = precompositionSnapshot.length;
                i < parent.childNodes.length;
                i++
              ) {
                parent.removeChild(parent.childNodes.item(i));
              }
            }
          }

          if (event.data) {
            insertText(view, event.data, {
              marks: compositionMarks,
            });
          }

          compositionMarks = null;
          precompositionSnapshot = null;
          setCursorWrapper(null);
          return true;
        },
        beforeinput(view, event) {
          event.preventDefault();
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
