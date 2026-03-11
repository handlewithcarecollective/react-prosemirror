import {
  RawCommands,
  getMarkType,
  getNodeType,
  getSchemaTypeNameByName,
} from "@tiptap/core";
import type { Mark, MarkType, Node, NodeType } from "@tiptap/pm/model";
import type { SelectionRange } from "@tiptap/pm/state";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    updateAttributes: {
      /**
       * Update attributes of a node or mark.
       * @param typeOrName The type or name of the node or mark.
       * @param attributes The attributes of the node or mark.
       * @example editor.commands.updateAttributes('mention', { userId: "2" })
       */
      updateAttributes: (
        /**
         * The type or name of the node or mark.
         */
        typeOrName: string | NodeType | MarkType,

        /**
         * The attributes of the node or mark.
         */
        attributes: Record<string, any>
      ) => ReturnType;
    };
  }
}

// Tiptap's updateAttributes command, but using setNodeAttribute instead of
// setNodeMarkup to avoid replacing entire leaf nodes
export const updateAttributes: RawCommands["updateAttributes"] =
  (typeOrName, attributes = {}) =>
  ({ tr, state, dispatch }) => {
    let nodeType: NodeType | null = null;
    let markType: MarkType | null = null;

    const schemaType = getSchemaTypeNameByName(
      typeof typeOrName === "string" ? typeOrName : typeOrName.name,
      state.schema
    );

    if (!schemaType) {
      return false;
    }

    if (schemaType === "node") {
      nodeType = getNodeType(typeOrName as NodeType, state.schema);
    }

    if (schemaType === "mark") {
      markType = getMarkType(typeOrName as MarkType, state.schema);
    }

    let canUpdate = false;

    tr.selection.ranges.forEach((range: SelectionRange) => {
      const from = range.$from.pos;
      const to = range.$to.pos;

      let lastPos: number | undefined;
      let lastNode: Node | undefined;
      let trimmedFrom: number;
      let trimmedTo: number;

      if (tr.selection.empty) {
        state.doc.nodesBetween(from, to, (node: Node, pos: number) => {
          if (nodeType && nodeType === node.type) {
            canUpdate = true;
            trimmedFrom = Math.max(pos, from);
            trimmedTo = Math.min(pos + node.nodeSize, to);
            lastPos = pos;
            lastNode = node;
          }
        });
      } else {
        state.doc.nodesBetween(from, to, (node: Node, pos: number) => {
          if (pos < from && nodeType && nodeType === node.type) {
            canUpdate = true;
            trimmedFrom = Math.max(pos, from);
            trimmedTo = Math.min(pos + node.nodeSize, to);
            lastPos = pos;
            lastNode = node;
          }

          if (pos >= from && pos <= to) {
            if (nodeType && nodeType === node.type) {
              canUpdate = true;

              if (dispatch) {
                Object.entries(attributes).forEach(([key, value]) => {
                  tr.setNodeAttribute(pos, key, value);
                });
              }
            }

            if (markType && node.marks.length) {
              node.marks.forEach((mark: Mark) => {
                if (markType === mark.type) {
                  canUpdate = true;

                  if (dispatch) {
                    const trimmedFrom2 = Math.max(pos, from);
                    const trimmedTo2 = Math.min(pos + node.nodeSize, to);

                    tr.addMark(
                      trimmedFrom2,
                      trimmedTo2,
                      markType.create({
                        ...mark.attrs,
                        ...attributes,
                      })
                    );
                  }
                }
              });
            }
          }
        });
      }

      if (lastNode) {
        if (dispatch) {
          Object.entries(attributes).forEach(([key, value]) => {
            if (lastPos !== undefined) tr.setNodeAttribute(lastPos, key, value);
          });
        }

        if (markType && lastNode.marks.length) {
          lastNode.marks.forEach((mark: Mark) => {
            if (markType === mark.type && dispatch) {
              tr.addMark(
                trimmedFrom,
                trimmedTo,
                markType.create({
                  ...mark.attrs,
                  ...attributes,
                })
              );
            }
          });
        }
      }
    });

    return canUpdate;
  };
