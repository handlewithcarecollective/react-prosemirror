import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { diff } from "@codemirror/merge";
import {
  EditorState as CodeMirrorState,
  Compartment,
  type Line,
  type SelectionRange,
  Transaction,
} from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  type EditorView as CodeMirrorView,
  type Command,
  type KeyBinding,
  keymap as cmKeymap,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
} from "@codemirror/view";
import {
  CodeMirror,
  CodeMirrorEditor,
  react,
  useEditorEffect as useCodeMirrorEffect,
  useReconfigure,
} from "@handlewithcare/react-codemirror";
import { exitCode } from "prosemirror-commands";
import { redo, undo } from "prosemirror-history";
import { Node } from "prosemirror-model";
import { EditorState, Selection, TextSelection } from "prosemirror-state";
import React, { HTMLProps, forwardRef, useMemo, useState } from "react";

import {
  type NodeViewComponentProps,
  useEditorEventCallback,
  useEditorState,
} from "../../src/index.js";
import { schema } from "../schema.js";

const keymapCompartment = new Compartment();

const extensions = [
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  drawSelection(),
  dropCursor(),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching({
    brackets: "()[]{}<>",
  }),
  closeBrackets(),
  autocompletion(),
  highlightActiveLine(),
  keymapCompartment.of(
    cmKeymap.of([...closeBracketsKeymap, ...defaultKeymap, ...completionKeymap])
  ),
  javascript({ jsx: true, typescript: true }),
  react,
  oneDark,
];

export const CodeBlock = forwardRef<
  HTMLDivElement | null,
  NodeViewComponentProps
>(function CodeBlock({ nodeProps, ...props }, ref) {
  const { node, getPos } = nodeProps;

  const editorState = useEditorState();

  const [codeMirrorState, setCodeMirrorState] = useState(() =>
    CodeMirrorState.create({ doc: node.textContent, extensions })
  );

  // We need to maintain extension state and selection
  // between renders, so we can't recompute the CodeMirror
  // EditorState from node.textContent on each render.
  //
  // The next best thing is to update state during render
  // when the node content doesn’t match the EditorState.
  // This will trigger another render, but React will abort
  // this render without running effects or committing
  // to the DOM, so we avoid any state tearing.
  if (node.textContent !== codeMirrorState.doc.toString()) {
    setCodeMirrorState((prev) => {
      const current = prev.doc.toString();
      const incoming = node.textContent;
      const diffed = diff(current, incoming);

      return prev.update({
        changes: diffed.map((change) => ({
          from: change.fromA,
          to: change.toA,
          insert: incoming.slice(change.fromB, change.toB),
        })),
      }).state;
    });
  }

  if (
    editorState.selection.from >= getPos() &&
    editorState.selection.to <= getPos() + node.nodeSize &&
    editorState.selection instanceof TextSelection &&
    (codeMirrorState.selection.main.anchor !==
      editorState.selection.$anchor.parentOffset ||
      codeMirrorState.selection.main.head !==
        editorState.selection.$head.parentOffset)
  ) {
    setCodeMirrorState(
      (prev) =>
        prev.update({
          selection: {
            anchor: editorState.selection.$anchor.parentOffset,
            head: editorState.selection.$head.parentOffset,
          },
        }).state
    );
  }

  const dispatchTransactions = useEditorEventCallback(
    (view, trs: readonly Transaction[], cmView: CodeMirrorView) => {
      const newState = trs.at(-1)?.state;
      if (!newState) return;

      // We have to store extensions etc in local state,
      // so even if the doc didn't change, we need to update
      // our local state. Otherwise, effects like reconfiguring
      // the keymap will just be dropped.
      if (!trs.some((tr) => tr.docChanged || !!tr.selection)) {
        setCodeMirrorState(newState);
        return;
      }

      if (!cmView.hasFocus) {
        return;
      }

      let offset = (getPos() ?? 0) + 1;
      const { main } = newState.selection;
      const selAnchor = offset + main.anchor;
      const selHead = offset + main.head;

      const pmTr = view.state.tr;

      const pmSel = pmTr.selection;
      if (trs.some((tr) => tr.docChanged)) {
        trs.forEach((tr) => {
          tr.changes.iterChanges((fromA, toA, fromB, toB, text) => {
            if (text.length) {
              pmTr.replaceWith(
                offset + fromA,
                offset + toA,
                schema.text(text.toString())
              );
            } else {
              pmTr.delete(offset + fromA, offset + toA);
            }
            offset += toB - fromB - (toA - fromA);
          });
        });
      }

      if (pmSel.anchor !== selAnchor || pmSel.head !== selHead) {
        pmTr.setSelection(TextSelection.create(pmTr.doc, selAnchor, selHead));
      }

      view.dispatch(pmTr);
    }
  );

  return (
    <div {...props} ref={ref} contentEditable={false}>
      <CodeMirror
        dispatchTransactions={dispatchTransactions}
        state={codeMirrorState}
        extensions={extensions}
      >
        <Editor state={editorState} node={node} getPos={getPos} />
      </CodeMirror>
    </div>
  );
});

function Editor({
  state,
  node,
  getPos,
  ...props
}: {
  state: EditorState;
  node: Node;
  getPos: () => number;
} & HTMLProps<HTMLDivElement>) {
  useCodeMirrorEffect(
    (view) => {
      if (
        state.selection.from >= getPos() &&
        state.selection.to <= getPos() + node.nodeSize &&
        state.selection instanceof TextSelection
      ) {
        view.focus();
      }
    },
    [getPos, node.nodeSize, state.selection]
  );

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

      tr.replaceRangeWith(pos, pos + node.nodeSize + 1, emptyParagraph)
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

  const reconfigureKeymap = useReconfigure(keymapCompartment);

  useCodeMirrorEffect(() => {
    reconfigureKeymap(
      cmKeymap.of([
        ...keymap,
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...completionKeymap,
      ])
    );
  }, [keymap, reconfigureKeymap]);

  return <CodeMirrorEditor {...props} />;
}
