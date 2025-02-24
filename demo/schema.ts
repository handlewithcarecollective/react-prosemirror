import { Schema } from "prosemirror-model";
import { tableNodes } from "prosemirror-tables";

export const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      group: "block",
      content: "inline*",
      toDOM() {
        return ["p", 0];
      },
    },
    heading: {
      group: "block",
      content: "inline*",
      attrs: {
        level: { default: 1, validate: "number" },
      },
      toDOM(node) {
        return [`h${node.attrs.level}`, 0];
      },
    },
    ...tableNodes({
      cellContent: "paragraph",
      cellAttributes: {},
      tableGroup: "block",
    }),
    list: {
      group: "block",
      content: "list_item+",
      toDOM() {
        return ["ul", 0];
      },
    },
    list_item: {
      content: "paragraph+",
      toDOM() {
        return ["li", 0];
      },
    },
    code_block: {
      group: "block",
      content: "text*",
      toDOM() {
        return ["pre", ["code", 0]];
      },
    },
    image: {
      group: "block",
      attrs: {
        url: { default: "", validate: "string" },
      },
      toDOM(node) {
        return [
          "div",
          [
            "img",
            {
              src: node.attrs.url,
            },
          ],
        ];
      },
    },
    text: { group: "inline" },
  },
  marks: {
    em: {
      toDOM() {
        return ["em", 0];
      },
      parseDOM: [
        {
          tag: "em",
        },
      ],
    },
    strong: {
      toDOM() {
        return ["strong", 0];
      },
      parseDOM: [
        {
          tag: "strong",
        },
      ],
    },
    code: {
      toDOM() {
        return [
          "code",
          {
            style:
              "background-color: lightgray; padding: 0.125rem 0.25rem; border-radius: 2px;",
          },
          0,
        ];
      },
      parseDOM: [
        {
          tag: "code",
        },
      ],
    },
    link: {
      attrs: {
        url: { default: "", validate: "string" },
      },
      toDOM(mark) {
        return ["a", { href: mark.attrs.url }, 0];
      },
      parseDOM: [
        {
          tag: "a",
          getAttrs(node) {
            return {
              url: (node as HTMLAnchorElement).href,
            };
          },
        },
      ],
    },
  },
});
