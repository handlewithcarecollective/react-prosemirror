import { Extension } from "@tiptap/core";

import { reactKeys } from "../../plugins/reactKeys.js";

export const ReactProseMirror = Extension.create({
  name: "@handlewithcare/react-prosemirror/reactKeys",
  addProseMirrorPlugins() {
    return [reactKeys()];
  },
});
