# Tiptap Integration

A way to build a rich text editor with Tiptap while still safely rendering your
ProseMirror editor with React.

<!-- toc -->

- [API](#api)
  - [`TiptapEditorView`](#tiptapeditorview)
  - [`TiptapEditorContent`](#tiptapeditorcontent)
  - [`tiptapNodeView`](#tiptapnodeview)
  - [`useTiptapEditor`](#usetiptapeditor)
  - [`useTiptapEditorEffect`](#usetiptapeditoreffect)
  - [`useTiptapEditorEventCallback`](#usetiptapeditoreventcallback)
  - [`useIsInReactProsemirror`](#useisinreactprosemirror)

<!-- tocstop -->

## The Problem

Tiptap has a first-party React integration, `@tiptap/react`, but it has some
downsides:

- Each React node view is rendered in a portal, and the portals are all direct
  siblings. This means that context doesn’t flow from parent node views to their
  children.
- ProseMirror View requires that a node view’s `dom` and `contentDOM` are
  produced synchronously, but React renders asynchronously. The result is that
  every node view needs to be wrapped in additional DOM nodes (which are not
  controlled by React). Your `paragraph` node view will look like
  `<div><p><span><span>text</span></span></p></div>`!
- There is a lot of state tearing. Tiptap executes side effects in render
  functions, renders node view components in a second render pass, and exposes
  the `Editor` in the render function and other unsafe locations. This means
  that you can run into issues with data corruption and user experience issues
  that are very challenging to pin down and resolve.

## The Solution

React ProseMirror has a React-based rendering system.
`@handlewithcare/react-prosemirror/tiptap` exposes an integration layer that
integrates that React-based ProseMirror renderer with Tiptap, allowing you to
keep your existing Tiptap extensions and commands, but giving you a safer React
integration. The React ProseMirror renderer also doesn’t require any wrapping
DOM nodes — your paragraph can just be `<p>text</p>`!

## Usage

### `useTiptapEditor`

To start, we’ll replace the usage of `@tiptap/react`’s `useEditor` hook with
React ProseMirror’s `useTiptapEditor`:

```tsx
// import { useEditor } from "@tiptap/react";
import { useTiptapEditor } from "@handlewithcare/react-prosemirror/tiptap";

// const editor = useEditor({ extensions })

const editor = useTiptapEditor({ extensions });
```

### `TiptapEditorView` and `TiptapEditorContent`

Next, we’ll replace `EditorContent` from `@tiptap/react` with
`TiptapEditorContent`. Like the plain React ProseMirror’s
[`ProseMirrorDoc`](../../README.md#prosemirrordoc), `TiptapEditorContent` must
be wrapped in a `TiptapEditorView`. Any components that are descendants of
`TiptapEditorView` can safely access the Tiptap Editor instance.

```tsx
// import { EditorContent, useEditor } from '@tiptap/react';
import {
  TiptapEditorView,
  TiptapEditorContent,
  useTiptapEditor,
} from "@handlewithcare/react-prosemirror/tiptap";

export function Editor() {
  // const editor = useEditor({ extensions })

  const editor = useTiptapEditor({ extensions });

  // return <EditorContent editor={editor} />

  return (
    <TiptapEditorView editor={editor}>
      <TiptapEditorContent editor={editor} />
    </TiptapEditorView>
  );
}
```

### `useTiptapEditorEffect` and `useTiptapEditorEventCallback`

Then, any usages of `useEffect` or `useCallback` that make use of the Editor
instance should be replaced with React ProseMirror’s `useTiptapEditorEffect` and
`useTiptapEditorEventCallback`. These will ensure that Editor access is limited
to safe points in the React render cycle, when the DOM, ProseMirror state, and
React state are all in sync.

```ts
// import { useEffect } from 'react';
import { useTiptapEditorEffect } from "@handlewithcare/react-prosemirror/tiptap";

// useEffect(() => {
//   editor.commands.focus();
// }, [editor])

useTiptapEditorEffect(
  (editor) => {
    editor.commands.focus();
  },
  [editor]
);
```

```ts
// import { useCallback } from 'react';
import { useTiptapEditorEventCallback } from "@handlewithcare/react-prosemirror/tiptap";

// const onClick = useCallback(() => {
//   editor.commands.focus();
// }, [editor])

// NOTE: `useTiptapEditorEventCallback` doesn’t require a dependencies
// argument.
const onClick = useTiptapEditorEventCallback((editor) => {
  editor.commands.focus();
});
```

### `tiptapNodeView`

And finally, any custom node views that use Tiptap’s `ReactNodeViewRenderer` can
be migrated with React ProseMirror’s `tiptapNodeView` higher order component:

```ts
import { tiptapNodeView } from "@handlewithcare/react-prosemirror/tiptap";
import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import Paragraph from "./ParagraphView.jsx";

const extension = Node.create({
  name: "paragraph",

  // NOTE: No need for addNodeView anymore!
  // addNodeView() {
  //   return ReactNodeViewRenderer(Paragraph);
  // },
});

export default extension;

export const paragraph = tiptapNodeView({
  extension,
  component: Paragraph,
});
```

You’ll need to pass your new React ProseMirror node view component to the
`TiptapEditorView` as a prop:

```tsx
import {
  TiptapEditorView,
  TiptapEditorContent,
  useTiptapEditor,
} from "@handlewithcare/react-prosemirror/tiptap";

import { paragraph } from "./extensions/Paragraph.js";

const nodeViewComponents = {
  paragraph,
};

export function Editor() {
  const editor = useTiptapEditor({ extensions });

  return (
    <TiptapEditorView editor={editor} nodeViewComponents={nodeViewComponents}>
      <TiptapEditorContent editor={editor} />
    </TiptapEditorView>
  );
}
```

`tiptapNodeView` is a compatibility helper. It’s not required for React
ProseMirror’s Tiptap integration, it just allows you to migrate from
`@tiptap/react` without needing to rewrite all of your React node view
components. It preserves all of `@tiptap/react`’s functionality, including the
default drag start behavior, `ignoreMutation` and `stopEvent` handlers, and
wrapping DOM nodes.

If you want to move to using React ProseMirror node view components directly,
which allows you to drop the wrapping DOM nodes, follow the guide for writing
[React node view components](../../README.md#building-node-view-with-react).

## API

### `TiptapEditorView`

```ts
type TiptapEditorView = (props: {
  editor: Editor;
  nodeViewComponents?: Record<string, ComponentType<NodeViewComponentProps>;
  markViewComponents: Record<string, ComponentType<MarkViewComponentProps>;
  children?: ReactNode;
  static?: boolean;
}) => JSX.Element;
```

Render a Tiptap-compatible React ProseMirror editor.

### `TiptapEditorContent`

```ts
type TiptapEditorContent = HTMLProps<HTMLElement> & (props: {
  editor: Editor;
  as?: ElementType;
}) => JSX.Element;
```

Renders the actual editable ProseMirror document.

This **must** be passed as a child to the `TiptapEditorView` component. It may
be wrapped in other components, and other childern may be passed before or
after. It must be passed the same `editor` as is passed to the
`TiptapEditorView`.

### `tiptapNodeView`

```ts
type tiptapNodeView = (options: {
  component: ComponentType<ReactNodeViewProps>;
  extension: ReactNodeViewProps["extension"];
  className?: string | undefined;
  attrs?:
    | Record<string, string>
    | ((props: {
        node: ProseMirrorNode;
        HTMLAttributes: Record<string, unknown>;
      }) => Record<string, string>)
    | undefined;
  as?: ElementType | undefined;
  stopEvent?:
    | ((props: {
        event: Event;
        defaultStopEvent: (event: Event) => boolean;
      }) => boolean)
    | null;
  ignoreMutation?:
    | ((props: {
        mutation: ViewMutationRecord;
        defaultIgnoreMutation: (mutation: ViewMutationRecord) => boolean;
      }) => boolean)
    | null;
  contentDOMElementTag?: ElementType | undefined;
}) => ComponentType<NodeViewComponentProps>;
```

Convert a Tiptap node view component to a React ProseMirror node view component
Given a Tiptap-compatible React component and a Tiptap extension, returns a
React component that can be passed to React ProseMirror as a custom node view.

Example:

```tsx
const nodeViews = {
  codeBlock: nodeView({
    component: function CodeBlock(nodeViewProps) {
      return (
        <pre>
          <NodeViewContent as="code" />
        </pre>
      );
    },
    extension: CodeBlockExtension,
  }),
};
```

### `useTiptapEditor`

```ts
type useTiptapEditor(
  options: Omit<Parameters<typeof useEditor[0], 'element'>,
  deps?: DependencyList
) => Editor
```

Create a React ProseMirror integrated Tiptap Editor instance. Use instead of
Tiptap’s `useEditor` hook.

### `useTiptapEditorEffect`

```ts
type useEditorEffect = (
  effect: (editor: Editor | null) => void | (() => void),
  dependencies?: React.DependencyList
) => void;
```

Registers a layout effect to run after the EditorView has been updated with the
latest EditorState and Decorations.

Effects can take a Tiptap Editor instance as an argument. This hook should be
used to execute layout effects that depend on the Editor, such as for
positioning DOM nodes based on ProseMirror positions.

Layout effects registered with this hook still fire synchronously after all DOM
mutations, but they do so _after_ the Editor has been updated, even when the
Editor lives in an ancestor component.

This hook can only be used in a component that is mounted as a child of the
TiptapEditorView component, including React node view components.

### `useTiptapEditorEventCallback`

```tsx
type useEditorEventCallback = <T extends unknown[]>(
  callback: (editor: Editor | null, ...args: T) => void
) => void;
```

Returns a stable function reference to be used as an event handler callback.

The callback will be called with the Tiptap Editor instance as its first
argument.

This hook can only be used in a component that is mounted as a child of the
TiptapEditorView component, including React node view components.

### `useIsInReactProsemirror`

```ts
type useIsInReactProseMirror = () => boolean;
```

Returns true if the hook is called in a component that's a descendant of the
ProseMirror component
