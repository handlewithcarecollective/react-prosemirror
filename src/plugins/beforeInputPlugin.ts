import { Fragment, Mark, Slice } from "prosemirror-model";
import { Plugin, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

import { ReactEditorView } from "../ReactEditorView.js";
import { browser } from "../browser.js";
import { CursorWrapper } from "../components/CursorWrapper.js";
import { widget } from "../decorations/ReactWidgetType.js";
import { DOMNode } from "../dom.js";
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
  let observer: MutationObserver | null = null;
  let preCompositionSnapshot: Fragment | null = null;

  function teardownComposition(view: ReactEditorView, endedAt: number) {
    view.input.composing = false;

    if (observer) {
      if (
        view.input.compositionNode &&
        view.dom.contains(view.input.compositionNode)
      ) {
        view.domObserver.queue.push(...observer.takeRecords());
        view.domObserver.flush();
      } else {
        const freezeFrom = reactKeysPluginKey.getState(view.state)?.freezeFrom;
        const frozenNode =
          freezeFrom == null ? null : view.state.doc.nodeAt(freezeFrom);

        if (
          freezeFrom != null &&
          frozenNode != null &&
          preCompositionSnapshot
        ) {
          // This is a little hacky — it only works because we always abort
          // compositions if the node after freezeFrom changes, so we can
          // be sure that if a composition was canceled by the user/browser,
          // the content hasn't changed since the composition started
          view.dispatch(
            view.state.tr.replaceWith(
              freezeFrom + 1,
              freezeFrom + 1 + frozenNode.content.size,
              preCompositionSnapshot
            )
          );
        }
      }
      observer.disconnect();
      observer = null;
    }

    view.input.compositionEndedAt = endedAt;
    view.input.compositionNode = null;
    view.input.compositionNodes = [];
    view.input.compositionID++;
  }

  return new Plugin({
    view() {
      return {
        update(view) {
          if (!(view instanceof ReactEditorView)) return;
          const frozen =
            reactKeysPluginKey.getState(view.state)?.freezeFrom != null;

          if (observer && view.composing && !frozen) {
            teardownComposition(view, Date.now());
          }
        },
      };
    },
    props: {
      handleDOMEvents: {
        compositionstart(view) {
          if (!(view instanceof ReactEditorView)) return false;

          const storedMarks = view.state.selection.empty
            ? view.state.storedMarks
            : view.state.storedMarks ??
              (view.state.selection instanceof TextSelection
                ? view.state.selection.$from.marksAcross(
                    view.state.selection.$to
                  )
                : null);

          view.dispatch(
            view.state.tr.deleteSelection().setStoredMarks(storedMarks)
          );

          handleGapCursorComposition(view);
          const { selection } = view.state;

          const tr = view.state.tr.delete(selection.from, selection.to);
          const $from = tr.doc.resolve(tr.mapping.map(selection.from));
          const isEmptyTextblock =
            $from.parent.isTextblock && $from.parent.childCount === 0;

          if (storedMarks != null || (browser.safari && isEmptyTextblock)) {
            view.dispatch(
              view.state.tr.setMeta(reactKeysPluginKey, {
                cursorWrapper: widget(
                  view.state.selection.from,
                  CursorWrapper,
                  {
                    key: "cursor-wrapper",
                    ...(storedMarks !== null && { marks: storedMarks }),
                    side: 0,
                    raw: true,
                  }
                ),
              })
            );
            // Pin the DOM cursor to PM's canonical position before the IME
            // captures wherever the browser happened to leave it. Without this,
            // a cursor at a mark boundary lands in either the left or right text
            // node depending on the user's last navigation direction, and the
            // IME composes into whichever one it found.
          } else if (view.state.selection.empty) {
            view.domObserver.disconnectSelection();
            try {
              view.docView.setSelection(
                view.state.selection.anchor,
                view.state.selection.head,
                view,
                true // force — skip the isEquivalentPosition early-return
              );
            } finally {
              view.domObserver.setCurSelection();
              view.domObserver.connectSelection();
            }
          }

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

          preCompositionSnapshot =
            view.state.doc.nodeAt(freezeFrom)?.content ?? null;

          view.input.composing = true;

          observer = new MutationObserver((records) => {
            if (reactKeysPluginKey.getState(view.state)?.freezeFrom == null) {
              return;
            }
            view.domObserver.queue.push(...records);
            view.domObserver.flush();
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

          teardownComposition(view, event.timeStamp);
          view.dispatch(
            view.state.tr.setMeta(reactKeysPluginKey, {
              cursorWrapper: null,
              freezeFrom: null,
            })
          );

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
              const ranges = event.getTargetRanges();
              if (
                ranges.length === 0 ||
                (ranges.length === 1 && ranges[0] && ranges[0].collapsed)
              ) {
                insertText(view, event.data);
              } else {
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
                  insertText(view, event.data, { from, to });
                }
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

                const marks = doc.resolve(start).marksAcross(doc.resolve(end));

                tr.delete(start, end);

                if (marks) {
                  tr.ensureMarks(marks);
                }
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

  const desc = view.docView.nearestDesc(compositionNode);

  compositionBlockDesc.node = compositionBlock;

  if (desc instanceof TextViewDesc) {
    if (
      compositionNode.nodeValue &&
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
      compositionNode.nodeValue != null &&
      desc.text !== compositionNode.nodeValue
    ) {
      desc.dom = compositionNode;
      desc.textDOM = compositionNode;
      desc.text = compositionNode.nodeValue;
      compositionNode.pmViewDesc = desc;
    }
    return;
  }

  const parentDesc = desc?.contentDOM ? desc : compositionBlockDesc;

  const children = parentDesc.children;

  // Drop any text or composition desc in this container whose DOM the
  // IME has detached. This covers two cases: a TextViewDesc the IME subsumed
  // into the composition node, and (on Safari, which replaces the whole text
  // node on each composition update) any orphaned composition view
  // desc(s) left over from the previous composition steps.
  for (let i = children.length - 1; i >= 0; i--) {
    const c = children[i];
    if (!(c instanceof TextViewDesc) && !(c instanceof CompositionViewDesc)) {
      continue;
    }
    const dom = c.dom;
    if (view.dom.contains(dom)) continue;
    children.splice(i, 1);
  }

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

  let topDOM: DOMNode = compositionNode;
  while (topDOM.parentNode && topDOM.parentNode !== parentDesc.contentDOM) {
    topDOM = topDOM.parentNode;
  }

  const insertIndex =
    children.findLastIndex((c) => c.posBefore <= startPos) + 1;
  children.splice(
    insertIndex,
    0,
    new CompositionViewDesc(
      parentDesc,
      () => startPos,
      topDOM,
      compositionNode,
      compositionNode.nodeValue ?? ""
    )
  );
}
