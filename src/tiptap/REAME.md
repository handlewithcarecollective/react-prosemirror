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

### `TiptapEditorContent`

### `tiptapNodeView`

### `useTiptapEditor`

### `useTiptapEditorEffect`

### `useTiptapEditorEventCallback`

### `useIsInReactProsemirror`
