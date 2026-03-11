import { Extension, commands as coreCommands } from "@tiptap/core";

import { updateAttributes } from "./commands/updateAttributes.js";

export const ReactProseMirrorCommands = Extension.create({
  name: "reactProseMirrorCommands",

  addCommands() {
    return {
      ...coreCommands,
      updateAttributes,
    };
  },
});
