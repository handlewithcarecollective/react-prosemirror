import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";

export const EMPTY_SCHEMA = new Schema({
  nodes: {
    doc: { content: "text*" },
    text: { inline: true },
  },
});

export const EMPTY_STATE = EditorState.create({
  schema: EMPTY_SCHEMA,
});
