import { Fragment, Mark, Slice } from "prosemirror-model";
import { Plugin, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

import { ReactEditorView } from "../ReactEditorView.js";
import { CursorWrapper } from "../components/CursorWrapper.js";
import { widget } from "../decorations/ReactWidgetType.js";
import {
  CompositionViewDesc,
  TextViewDesc,
  findTextInFragment,
} from "../viewdesc.js";

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

const observeOptions = {
  childList: true,
  characterData: true,
  characterDataOldValue: true,
  attributes: true,
  attributeOldValue: true,
  subtree: true,
};

export function beforeInputPlugin() {
  let compositionMarks: readonly Mark[] | null = null;
  let observer: MutationObserver | null = null;
  return new Plugin({
    props: {
      handleDOMEvents: {
        compositionstart(view) {
          if (!(view instanceof ReactEditorView)) return false;

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

          // TODO: properly determine the shared-depth ancestore between
          // from and to
          const freezeFrom = view.state.selection.$from.before();

          view.dispatch(
            view.state.tr.setMeta(reactKeysPluginKey, {
              freezeFrom,
            })
          );

          const frozenDom = view.nodeDOM(freezeFrom);
          if (!frozenDom) {
            view.dispatch(
              view.state.tr.setMeta(reactKeysPluginKey, {
                cursorWrapper: null,
                freezeFrom: null,
              })
            );
            return false;
          }

          view.input.composing = true;

          observer = new MutationObserver((records) => {
            view.domObserver.queue.push(...records);
            try {
              view.domObserver.flush();
            } catch (e) {
              const n = view.domObserver.lastChangedTextNode;
              const d = n && (n as any).pmViewDesc;
              const ff = reactKeysPluginKey.getState(view.state)?.freezeFrom;
              const block = ff != null ? view.docView.descAt(ff) : null;
              const safe = (fn: () => unknown) => {
                try {
                  return fn();
                } catch {
                  return "THROW";
                }
              };
              throw new Error(
                `FLUSH FAIL docSize=${view.state.doc.content.size} freezeFrom=${ff}` +
                  ` imeNode=${JSON.stringify(n?.nodeValue)} descType=${
                    d?.constructor?.name
                  }` +
                  ` posStart=${safe(() => d?.posAtStart)} posEnd=${safe(
                    () => d?.posAtEnd
                  )}` +
                  ` blockChildren=${JSON.stringify(
                    (block as any)?.children?.map((c: any) => ({
                      t: c.constructor.name,
                      size: c.size,
                      text: c.node?.text ?? c.text,
                    }))
                  )}` +
                  ` records=${JSON.stringify(
                    records.map((r) => ({
                      t: r.type,
                      v: (r.target as any)?.nodeValue,
                    }))
                  )}` +
                  ` || ${(e as Error).message}`
              );
            }
            syncCompositionViewDescs(view);
          });

          observer.observe(frozenDom, observeOptions);

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

          if (observer) {
            view.domObserver.queue.push(...observer.takeRecords());
            observer.disconnect();
            observer = null;
            view.domObserver.flush();
          }

          view.dispatch(
            view.state.tr.setMeta(reactKeysPluginKey, {
              cursorWrapper: null,
              freezeFrom: null,
            })
          );

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

function syncCompositionViewDescs(view: ReactEditorView) {
  const compositionNode = view.domObserver.lastChangedTextNode;
  if (!compositionNode) return;

  const freezeFrom = reactKeysPluginKey.getState(view.state)?.freezeFrom;
  if (freezeFrom == null) return;

  const compositionBlock = view.state.doc.nodeAt(freezeFrom);
  if (!compositionBlock) return;

  const compositionBlockDesc = view.docView.descAt(freezeFrom);
  if (!compositionBlockDesc) return;

  const desc = compositionNode?.pmViewDesc;

  compositionBlockDesc.node = compositionBlock;

  if (desc instanceof TextViewDesc) {
    if (
      compositionNode?.nodeValue &&
      desc.node.text !== compositionNode.nodeValue
    ) {
      desc.node = view.state.schema.text(
        compositionNode.nodeValue,
        desc.node.marks
      );
      desc.nodeDOM = compositionNode;
      compositionNode.pmViewDesc = desc;
    }
    return;
  }

  if (desc instanceof CompositionViewDesc) {
    if (
      compositionNode?.nodeValue != null &&
      desc.text !== compositionNode.nodeValue
    ) {
      desc.dom = compositionNode;
      desc.textDOM = compositionNode;
      desc.text = compositionNode.nodeValue;
      compositionNode.pmViewDesc = desc;
    }
    return;
  }

  const replaced = compositionBlockDesc.children.findIndex((c) => {
    if (!(c instanceof TextViewDesc)) return false;
    const dom = c.nodeDOM ?? c.dom;

    return dom && !view.dom.contains(dom);
  });

  compositionBlockDesc.children.splice(replaced, 1);

  const contentStart = freezeFrom + 1;

  const { from, to } = view.state.selection;

  const textPos = findTextInFragment(
    compositionBlock.content,
    compositionNode.nodeValue ?? "",
    from - contentStart,
    to - contentStart
  );

  if (textPos < 0) return;

  const startPos = contentStart + textPos;

  const prevSiblingIndex = compositionBlockDesc.children.findLastIndex(
    (desc) => desc.posBefore <= startPos
  );
  compositionBlockDesc.children.splice(
    prevSiblingIndex + 1,
    0,
    new CompositionViewDesc(
      compositionBlockDesc,
      () => startPos,
      compositionNode,
      compositionNode,
      compositionNode.nodeValue ?? ""
    )
  );
}
