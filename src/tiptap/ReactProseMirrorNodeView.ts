import {
  Editor,
  NodeView,
  NodeViewRendererOptions,
  NodeViewRendererProps,
} from "@tiptap/core";

/**
 * Subclass of Tiptap's NodeView to be used in tiptapNodeView.
 *
 * Allows us to pass in an existing dom and contentODM from React ProseMirror's
 * ViewDesc, so that we can call Tiptap's default stopEvent and ignoreMutation
 * methods
 */
export class ReactProseMirrorNodeView<
  Component,
  NodeEditor extends Editor = Editor,
  Options extends NodeViewRendererOptions = NodeViewRendererOptions
> extends NodeView<Component, NodeEditor, Options> {
  private _dom: HTMLElement;
  private _contentDOM: HTMLElement | null;

  constructor(
    component: Component,
    props: NodeViewRendererProps,
    dom: HTMLElement,
    contentDOM: HTMLElement | null,
    options?: Partial<Options>
  ) {
    super(component, props, options);
    this._dom = dom;
    this._contentDOM = contentDOM;
  }

  get dom() {
    return this._dom;
  }

  get contentDOM() {
    return this._contentDOM;
  }
}
