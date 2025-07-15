import { Mark } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import { Decoration, EditorView } from "prosemirror-view";

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

  if (view.someProp("handleTextInput", (f) => f(view, from, to, eventData))) {
    return true;
  }

  const { tr } = view.state;
  if (options.marks) tr.ensureMarks(options.marks);

  tr.insertText(eventData, from, to);

  view.dispatch(tr);
  return true;
}

export function beforeInputPlugin(
  setCursorWrapper: (deco: Decoration | null) => void
) {
  let compositionMarks: readonly Mark[] | null = null;
  const precompositionSnapshot: DOMNode[] = [];
  return new Plugin({
    props: {
      handleDOMEvents: {
        compositionstart(view) {
          const { state } = view;

          view.dispatch(state.tr.deleteSelection());

          const $pos = state.selection.$from;

          compositionMarks = state.storedMarks ?? $pos.marks();
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
          parent.childNodes.forEach((node) => {
            precompositionSnapshot.push(node);
          });

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

          if (event.data) {
            insertText(view, event.data, {
              marks: compositionMarks,
            });
          }

          compositionMarks = null;
          precompositionSnapshot.splice(0, precompositionSnapshot.length);
          setCursorWrapper(null);
          return true;
        },
        beforeinput(view, event) {
          event.preventDefault();
          switch (event.inputType) {
            case "insertParagraph":
            case "insertLineBreak": {
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
            case "deleteContentBackward":
            case "deleteWordForward":
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
