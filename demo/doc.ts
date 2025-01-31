import {
  RemarkProseMirrorOptions,
  remarkProseMirror,
  toPmMark,
  toPmNode,
} from "@handlewithcare/remark-prosemirror";
import { gfmTableFromMarkdown, gfmTableToMarkdown } from "mdast-util-gfm-table";
import { gfmTable } from "micromark-extension-gfm-table";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { type Processor } from "unified";
import { CONTINUE, visit } from "unist-util-visit";

import { content } from "./content.js";
import { schema } from "./schema.js";

declare module "mdast" {
  interface TableCellData {
    head?: boolean;
  }
}

export function remarkTable(this: Processor) {
  const data = this.data();

  const micromarkExtensions =
    data.micromarkExtensions || (data.micromarkExtensions = []);
  const fromMarkdownExtensions =
    data.fromMarkdownExtensions || (data.fromMarkdownExtensions = []);

  micromarkExtensions.push(gfmTable());
  fromMarkdownExtensions.push(gfmTableFromMarkdown());
  // Custom extension to mark which cells belong to the 'head'
  // table row, since the only way to identify them in the
  // mdast is by whether they're the first row in the table
  fromMarkdownExtensions.push({
    transforms: [
      function (tree) {
        visit(tree, "tableRow", function (row, index, parent) {
          if (!parent || index === undefined || index > 0) {
            return CONTINUE;
          }

          row.children.forEach((cell) => {
            cell.data ??= {};
            cell.data["head"] = true;
          });
        });
      },
    ],
  });
}

const remarkProseMirrorOptions: RemarkProseMirrorOptions = {
  schema,
  handlers: {
    paragraph: toPmNode(schema.nodes.paragraph),
    heading: toPmNode(schema.nodes.heading, (node) => ({
      level: node.depth,
    })),
    code(node) {
      return schema.nodes.code_block.create({}, schema.text(node.value));
    },
    image: toPmNode(schema.nodes.image, (node) => ({
      url: node.url,
    })),
    list: toPmNode(schema.nodes.list),
    listItem: toPmNode(schema.nodes.list_item),
    tableCell(node, _, state) {
      const children = state.all(node);
      if (node.data?.head) {
        return schema.nodes.table_header.create(
          {},
          // prosemirror-tables commands expect that table_cells
          // have block children, so each has exactly one paragraph.
          // Markdown only allows phrasing content in a table cell,
          // so we wrap the phrasing content from the tableCell in a
          // paragraph.
          schema.nodes.paragraph.create({}, children)
        );
      }
      return schema.nodes.table_cell.create(
        {},
        schema.nodes.paragraph.create({}, children)
      );
    },
    tableRow: toPmNode(schema.nodes.table_row),
    table: toPmNode(schema.nodes.table),

    emphasis: toPmMark(schema.marks.em),
    strong: toPmMark(schema.marks.strong),
    inlineCode(node) {
      return schema.text(node.value, [schema.marks.code.create()]);
    },
    link: toPmMark(schema.marks.link, (node) => ({
      url: node.url,
    })),

    thematicBreak: toPmNode(schema.nodes.paragraph),
  },
};

export const doc = await unified()
  .use(remarkParse)
  .use(remarkTable)
  .use(remarkProseMirror, remarkProseMirrorOptions)
  .process(content)
  .then(({ result }) => result);
