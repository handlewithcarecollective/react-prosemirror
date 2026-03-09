import { Extension, commands as coreCommands } from "@tiptap/core";

import { updateAttributes } from "./commands/updateAttributes.js";

export const ReactProseMirrorCommands = Extension.create({
  name: "commands",

  addCommands() {
    return {
      ...coreCommands,
      updateAttributes,
    };
  },
});
