import { Fragment, type Mark, Slice } from "prosemirror-model";
import { Plugin, TextSelection } from "prosemirror-state";
import type { Decoration, EditorView } from "prosemirror-view";

import type { ReactEditorView } from "../ReactEditorView.js";
import { CursorWrapper } from "../components/CursorWrapper.js";
import { widget } from "../decorations/ReactWidgetType.js";
import type { DOMNode } from "../dom.js";

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

export function beforeInputPlugin(
  setCursorWrapper: (deco: Decoration | null) => void
) {
  let compositionMarks: readonly Mark[] | null = null;
  let precompositionSnapshot: DOMNode[] | null = null;
  return new Plugin({
    props: {
      handleDOMEvents: {
        compositionstart(view) {
          const { state } = view;

          view.dispatch(state.tr.deleteSelection());

          // Re-read state after dispatch — the stale `state` reference no
          // longer reflects the current document after deleteSelection.
          let currentState = view.state;
          let $pos = currentState.selection.$from;

          // If the cursor is not in a textblock (e.g. a GapCursor between
          // block nodes), insert a wrapping textblock so the browser has a
          // text node to compose into. We must do this here — before
          // taking the DOM snapshot — because without a snapshot the
          // compositionend handler cannot restore the DOM prior to calling
          // insertText, which leads to the composed text appearing twice.
          if (!$pos.parent.isTextblock) {
            const textNodeType = currentState.schema.nodes.text;
            if (!textNodeType) return false;
            const wrap = $pos.parent
              .contentMatchAt($pos.index())
              .findWrapping(textNodeType);
            if (!wrap) return false;

            let frag = Fragment.empty;
            for (let i = wrap.length - 1; i >= 0; i--) {
              const wrapType = wrap[i];
              if (!wrapType) return false;
              const node = wrapType.createAndFill(null, frag);
              if (!node) return false;
              frag = Fragment.from(node);
            }

            const tr = currentState.tr.replace(
              $pos.pos,
              $pos.pos,
              new Slice(frag, 0, 0)
            );
            tr.setSelection(TextSelection.near(tr.doc.resolve($pos.pos + 1)));
            view.dispatch(tr);
            currentState = view.state;
            $pos = currentState.selection.$from;
            // Safety check: if still not in a textblock after wrapping, bail.
            if (!$pos.parent.isTextblock) return false;
          }

          compositionMarks = currentState.storedMarks ?? $pos.marks();
          if (compositionMarks) {
            setCursorWrapper(
              widget(currentState.selection.from, CursorWrapper, {
                key: "cursor-wrapper",
                marks: compositionMarks,
              })
            );
          }

          // Snapshot the siblings of the node that contains the current
          // cursor. We'll restore this later, so that React doesn't panic
          // about unknown DOM nodes introduced by the browser's IME.
          const { node: parent } = view.domAtPos($pos.pos);
          precompositionSnapshot = [];
          for (const node of parent.childNodes) {
            precompositionSnapshot.push(node);
          }

          (view as ReactEditorView).input.composing = true;
          return true;
        },
        compositionupdate() {
          return true;
        },
        compositionend(view, event) {
          (view as ReactEditorView).input.composing = false;

          const { state } = view;
          const { node: parent } = view.domAtPos(state.selection.from);

          if (precompositionSnapshot) {
            // Restore the snapshot of the parent node's children from before
            // the composition started. This gives us a clean slate from
            // which to dispatch our transaction and trigger a React update.
            //
            // Wrapped in try/catch because structural edits dispatched during
            // compositionstart (e.g. inserting a wrapping textblock at a
            // gap-cursor position) may have moved or removed the snapshotted
            // nodes, making replaceChild throw. In that case we skip
            // restoration and let React reconcile the DOM on the next render.
            try {
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
            } catch (_) {
              // DOM restoration failed — structural changes during composition
              // made the snapshot stale. React will reconcile on next render.
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
