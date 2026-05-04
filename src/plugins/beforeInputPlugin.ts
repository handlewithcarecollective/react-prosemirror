import { Fragment, Mark, Slice } from "prosemirror-model";
import { Plugin, TextSelection } from "prosemirror-state";
import { Decoration, EditorView } from "prosemirror-view";

import { ReactEditorView } from "../ReactEditorView.js";
import { CursorWrapper } from "../components/CursorWrapper.js";
import { widget } from "../decorations/ReactWidgetType.js";

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
  // let precompositionSnapshot: DOMNode[] | null = null;

  return new Plugin({
    props: {
      handleDOMEvents: {
        compositionstart(view) {
          if (!(view instanceof ReactEditorView)) return false;
          compositionMarks = view.state.storedMarks;

          view.dispatch(view.state.tr.deleteSelection());
          handleGapCursorComposition(view);

          const { state } = view;
          // const $pos = state.selection.$from;

          if (compositionMarks?.length) {
            setCursorWrapper(
              widget(state.selection.from, CursorWrapper, {
                key: "cursor-wrapper",
                marks: compositionMarks,
              })
            );
          }

          view.input.composing = true;
          return true;
        },
        compositionupdate() {
          return true;
        },
        compositionend(view) {
          if (!(view instanceof ReactEditorView)) return false;

          view.input.composing = false;

          compositionMarks = null;
          setCursorWrapper(null);
          if (
            view.input.compositionNode &&
            !view.input.compositionNode.pmViewDesc &&
            (view.input.compositionNode instanceof CharacterData ||
              view.input.compositionNode instanceof Element)
          ) {
            view.input.compositionNode.remove();
          }
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
            case "insertCompositionText": {
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

              // When we insert the text that corresponds to an ongoing composition,
              // the relevant TextNodeView will pause re-rendering so that React doesn't
              // clobber the composition in the DOM. This means that we have to wait for
              // the browser to update the DOM itself before attempting to reconcile
              // the selection, so we specifically defer pending effects to the next
              // macro task
              if (view instanceof ReactEditorView) {
                view.deferPendingEffects = true;
              }

              view.dispatch(tr);

              if (view instanceof ReactEditorView) {
                view.deferPendingEffects = false;
              }

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
