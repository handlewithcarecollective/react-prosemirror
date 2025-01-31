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
        return schema.nodes.table_header.create({}, children);
      }
      return schema.nodes.table_cell.create({}, children);
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
  },
};

const content = `# This is the \`@handlewithcare/react-prosemirror\` demo editor!

React ProseMirror is a library for integrating… Well, React and ProseMirror!

The result is a fully featured text editing library that integrates beautifully with
React, without giving up the expressiveness and flexibility of ProseMirror.

Custom node views can be authored as plain React components. Here's an example:

\`\`\`
export const Paragraph = forwardRef(function Paragraph(
  { children, nodeProps, ...props }: NodeViewComponentProps,
  ref: Ref<HTMLParagraphElement>
) {
  return (
    <p ref={ref} {...props}>
      {children}
    </p>
  );
});
\`\`\`

Obviously, there’s not a lot of utility in making a custom React node view for
a simple paragraph node. For a much more elaborate example, check out the [CodeBlock
component](https://github.com/handlewithcarecollective/react-prosemirror/blob/main/demo/nodeViews/CodeBlock.tsx)
that we use to render that code editor! It integrates with [CodeMirror](https://codemirror.net/)
through the \`@uiw/react-codemirror\` library.

But you don’t _have_ to use React to build custom node views. React ProseMirror works just fine
with plain custom node views, so if you want to use an existing ProseMirror plugin, like
[prosemirror-tables](https://github.com/prosemirror/prosemirror-tables), it just works!

| ProseMirror | React ProseMirror |
| ----------- | ----------------- |
| Supports custom node views via manual DOM manipulation, without any framework. | Supports custom node views via manual DOM manipulation, in addition to React-based node views! |
  `;

export const doc = await unified()
  .use(remarkParse)
  .use(remarkTable)
  .use(remarkProseMirror, remarkProseMirrorOptions)
  .process(content)
  .then(({ result }) => result);
