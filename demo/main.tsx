import { baseKeymap, toggleMark } from "prosemirror-commands";
import { gapCursor } from "prosemirror-gapcursor";
import "prosemirror-gapcursor/style/gapcursor.css";
import { history, redo, undo } from "prosemirror-history";
import { inputRules, wrappingInputRule } from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import { EditorState, Transaction } from "prosemirror-state";
import { columnResizing, tableEditing } from "prosemirror-tables";
import "prosemirror-tables/style/tables.css";
import "prosemirror-view/style/prosemirror.css";
import React, { StrictMode, useCallback, useState } from "react";
import { createRoot } from "react-dom/client";

import { ProseMirror, ProseMirrorDoc, reactKeys } from "../src/index.js";

import { LinkTooltip } from "./LinkTooltip.js";
import { doc } from "./doc.js";
import "./main.css";
import { CodeBlock } from "./nodeViews/CodeBlock.js";
import { schema } from "./schema.js";

const editorState = EditorState.create({
  schema,
  doc,
  plugins: [
    inputRules({
      rules: [wrappingInputRule(/^\s*([-+*])\s$/, schema.nodes.list)],
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
