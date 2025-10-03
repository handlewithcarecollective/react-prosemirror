import { baseKeymap, toggleMark } from "prosemirror-commands";
import { gapCursor } from "prosemirror-gapcursor";
import "prosemirror-gapcursor/style/gapcursor.css";
import { history, redo, undo } from "prosemirror-history";
import {
  InputRule,
  inputRules,
  wrappingInputRule,
} from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import { NodeType } from "prosemirror-model";
import {
  EditorState,
  NodeSelection,
  TextSelection,
  Transaction,
} from "prosemirror-state";
import { columnResizing, tableEditing } from "prosemirror-tables";
import "prosemirror-tables/style/tables.css";
import "prosemirror-view/style/prosemirror.css";
import React, { StrictMode, useCallback, useState } from "react";
import { createRoot } from "react-dom/client";

import { ProseMirror, ProseMirrorDoc, reactKeys } from "../src/index.js";

import { LinkTooltip } from "./LinkTooltip.js";
import Menu from "./Menu.js";
import { doc } from "./doc.js";
import "./main.css";
import { CodeBlock } from "./nodeViews/CodeBlock.js";
import { schema } from "./schema.js";

// Given a code block node type, returns an input rule that turns a
// textblock starting with three backticks into a code block.
export const codeBlockRule = (nodeType: NodeType): InputRule => {
  return new InputRule(/^```$/, (state, _match, start, end) => {
    const $start = state.doc.resolve(start);
    if (
      !$start
        .node(-1)
        .canReplaceWith($start.index(-1), $start.indexAfter(-1), nodeType)
    ) {
      return null;
    }

    let tr = state.tr;

    tr = state.tr.delete(start, end).setBlockType(start, start, nodeType);

    tr = tr.setSelection(TextSelection.create(tr.doc, start));

    return tr;
  });
};

const editorState = EditorState.create({
  schema,
  doc,
  plugins: [
    inputRules({
      rules: [
        wrappingInputRule(/^\s*([-+*])\s$/, schema.nodes.list),
        codeBlockRule(schema.nodes.code_block),
      ],
    }),
    columnResizing(),
    tableEditing(),
    history(),
    reactKeys(),
  ],
});

const plugins = [
  keymap({
    ...baseKeymap,
    "Mod-i": toggleMark(schema.marks.em),
    "Mod-b": toggleMark(schema.marks.strong),
    "Mod-Shift-c": toggleMark(schema.marks.code),
    "Mod-z": undo,
    "Mod-Shift-z": redo,
    "Mod-y": redo,
  }),
  gapCursor(),
];

const nodeViews = {
  code_block: CodeBlock,
};

function DemoEditor() {
  const [state, setState] = useState(editorState);

  const dispatchTransaction = useCallback(function (tr: Transaction) {
    setState((prev) => {
      return prev.apply(tr);
    });
  }, []);

  return (
    <main>
      <h1>React ProseMirror Demo</h1>
      <ProseMirror
        className="ProseMirror"
        state={state}
        dispatchTransaction={dispatchTransaction}
        nodeViews={nodeViews}
        plugins={plugins}
      >
        <Menu />
        <ProseMirrorDoc spellCheck={false} />
        <LinkTooltip />
      </ProseMirror>
    </main>
  );
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const root = createRoot(document.getElementById("root")!);

root.render(
  <StrictMode>
    <DemoEditor />
  </StrictMode>
);
