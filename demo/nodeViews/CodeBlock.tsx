import { defaultKeymap } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { type Line, Prec, type SelectionRange } from "@codemirror/state";
import {
  type EditorView as CodeMirrorView,
  type Command,
  type KeyBinding,
  type ViewUpdate,
  keymap as cmKeymap,
  drawSelection,
} from "@codemirror/view";
import ReactCodeMirror, {
  type ReactCodeMirrorRef,
  oneDark,
} from "@uiw/react-codemirror";
import { exitCode } from "prosemirror-commands";
import { redo, undo } from "prosemirror-history";
import { Selection, TextSelection } from "prosemirror-state";
import React, { forwardRef, useMemo, useRef } from "react";

import {
  type NodeViewComponentProps,
  useEditorEventCallback,
  useStopEvent,
} from "../../src/index.js";
import { schema } from "../schema.js";

export const CodeBlock = forwardRef<
  HTMLDivElement | null,
  NodeViewComponentProps
>(function CodeBlock({ nodeProps, ...props }, outerRef) {
  const ref = useRef<HTMLDivElement | null>(null);

  const { node, getPos } = nodeProps;

  const cmViewRef = useRef<CodeMirrorView | null>(null);

  const onCommit = useEditorEventCallback((view) => {
    if (!exitCode(view.state, view.dispatch)) {
      return false;
    }
    view.focus();
    return true;
  });

  const onUndo = useEditorEventCallback((view) => {
    return undo(view.state, view.dispatch, view);
  });

  const onRedo = useEditorEventCallback((view) => {
    return redo(view.state, view.dispatch, view);
  });

  const onDelete = useEditorEventCallback((view, cmView: CodeMirrorView) => {
    if (cmView.state.doc.length === 0) {
      const pos = getPos();
      const emptyParagraph = schema.nodes.paragraph.create();

      const tr = view.state.tr;

      tr.replaceRangeWith(
        pos,
        pos + nodeProps.node.nodeSize + 1,
        emptyParagraph
      )
        .setSelection(Selection.near(tr.doc.resolve(tr.mapping.map(pos)), 1))
        .scrollIntoView();

      view.dispatch(tr);
      view.focus();
      return true;
    }

    return false;
  });

  const withMaybeEscape = useEditorEventCallback(
    (view, unit: "line" | "char", dir: -1 | 1, cmView: CodeMirrorView) => {
      const state = cmView.state;
      if (!state) {
        return false;
      }

      let main: SelectionRange | Line = state.selection.main;
      if (!main.empty) {
        return false;
      }

      if (unit == "line") {
        main = state.doc.lineAt(main.head);
      }

      if (dir < 0 ? main.from > 0 : main.to < state.doc.length) {
        return false;
      }

      const targetPos = (getPos() || 0) + (dir < 0 ? 0 : node.nodeSize);
      const sel = Selection.near(view.state.doc.resolve(targetPos), dir);

      let tr = view.state.tr;

      if (dir === -1) {
        tr = view.state.tr.setSelection(sel).scrollIntoView();
      } else if (dir === 1) {
        // Insert empty paragraph if `code_block` is the last node in the document.
        if (
          sel.$anchor.node().type === schema.nodes.code_block &&
          !sel.$anchor.nodeAfter
        ) {
          const emptyParagraph = schema.nodes.paragraph.create();
          tr = tr.insert(sel.$anchor.pos, emptyParagraph);
        }
        const newSel = Selection.near(tr.doc.resolve(sel.$anchor.pos + 1), dir);
        tr = tr.setSelection(newSel).scrollIntoView();
      }

      view.dispatch(tr);
      view.focus();

      return true;
    }
  );

  const keymap = useMemo<readonly KeyBinding[]>(
    () => [
      {
        key: "ArrowUp",
        run: ((view) => withMaybeEscape("line", -1, view)) as Command,
      },
      {
        key: "ArrowLeft",
        run: ((view) => withMaybeEscape("char", -1, view)) as Command,
      },
      {
        key: "ArrowDown",
        run: ((view) => withMaybeEscape("line", 1, view)) as Command,
      },
      {
        key: "ArrowRight",
        run: ((view) => withMaybeEscape("char", 1, view)) as Command,
      },
      {
        key: "Ctrl-Enter",
        run: onCommit as Command,
      },
      { key: "Ctrl-z", mac: "Cmd-z", run: onUndo as Command },
      {
        key: "Shift-Ctrl-z",
        mac: "Shift-Cmd-z",
        run: onRedo as Command,
      },
      { key: "Ctrl-y", mac: "Cmd-y", run: onRedo as Command },
      { key: "Backspace", run: onDelete as Command },
      { key: "Delete", run: onDelete as Command },
      {
        key: "Tab",
        run: (view) => {
          view.dispatch(view.state.replaceSelection("\t"));
          return true;
        },
      },
      {
        key: "Shift-Tab",
        run: () => {
          return true;
        },
      },
    ],
    [onCommit, onDelete, onRedo, onUndo, withMaybeEscape]
  );

  const onUpdate = useEditorEventCallback((view, update: ViewUpdate) => {
    if (update.state.doc.toString() === node.textContent) {
      return;
    }
    if (!update.view.hasFocus) {
      return;
    }

    let offset = (getPos() ?? 0) + 1;
    const { main } = update.state.selection;
    const selFrom = offset + main.from;
    const selTo = offset + main.to;

    const tr = view.state.tr;

    const pmSel = tr.selection;
    if (update.docChanged || pmSel.from != selFrom || pmSel.to != selTo) {
      update.changes.iterChanges((fromA, toA, fromB, toB, text) => {
        if (text.length) {
          tr.replaceWith(
            offset + fromA,
            offset + toA,
            schema.text(text.toString())
          );
        } else {
          tr.delete(offset + fromA, offset + toA);
        }
        offset += toB - fromB - (toA - fromA);
      });

      tr.setSelection(TextSelection.create(tr.doc, selFrom, selTo));
    }

    view.dispatch(tr);
  });

  const extensions = useMemo(
    () => [
      oneDark,
      Prec.highest(cmKeymap.of([...keymap, ...defaultKeymap])),
      drawSelection(),
      javascript({ jsx: true, typescript: true }),
    ],
    [keymap]
  );

  useStopEvent((view, event) => {
    if (event instanceof InputEvent) return true;
    return false;
  });

  const onFocus = useEditorEventCallback((view) => {
    const pmSel = view.state.selection;
    const cmSel = cmViewRef.current?.state.selection.main;

    if (!cmSel) {
      return;
    }

    const offset = (getPos() ?? 0) + 1;
    const selFrom = offset + cmSel.from;
    const selTo = offset + cmSel.to;

    if (pmSel.from === selFrom && pmSel.to === selTo) {
      return;
    }

    let tr = view.state.tr;
    tr = tr.setSelection(TextSelection.create(tr.doc, selFrom, selTo));
    view.dispatch(tr);
  });

  const cmElRef = useEditorEventCallback((view, cmRef: ReactCodeMirrorRef) => {
    const cmView = cmRef?.view ?? null;
    if (cmViewRef.current === cmView) {
      return;
    }
    cmViewRef.current = cmView;
    // When a new CodeBlock is created, if it contains
    // the ProseMirror selection, focus it
    if (
      cmViewRef.current &&
      view.state.selection.from >= getPos() &&
      view.state.selection.to <= getPos() + node.nodeSize
    ) {
      cmViewRef.current.focus();
    }
  });

  return (
    <div
      ref={(el) => {
        ref.current = el;
        if (!outerRef) {
          return;
        }
        if (typeof outerRef === "function") {
          outerRef(el);
        } else {
          outerRef.current = el;
        }
      }}
      contentEditable={false}
      onClick={(e) => {
        cmViewRef.current?.focus();
      }}
      {...props}
    >
      <ReactCodeMirror
        ref={cmElRef}
        onUpdate={onUpdate}
        value={node.textContent}
        theme="dark"
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
          autocompletion: true,
        }}
        extensions={extensions}
        onFocus={onFocus}
      />
    </div>
  );
});
