import {
  getAttributesFromExtensions,
  getRenderedAttributes,
} from "@tiptap/core";
import {
  ReactNodeViewContentProvider,
  type ReactNodeViewProps,
  useCurrentEditor,
} from "@tiptap/react";
import cx from "classnames";
import { type Node as ProseMirrorNode } from "prosemirror-model";
import { ViewMutationRecord } from "prosemirror-view";
import React, {
  type ComponentType,
  ElementType,
  forwardRef,
  memo,
  useMemo,
  useRef,
} from "react";

import { NodeViewComponentProps } from "../components/NodeViewComponentProps.js";
import { useEditorEventCallback } from "../hooks/useEditorEventCallback.js";
import { useIgnoreMutation } from "../hooks/useIgnoreMutation.js";
import { useIsNodeSelected } from "../hooks/useIsNodeSelected.js";
import { useStopEvent } from "../hooks/useStopEvent.js";
import { htmlAttrsToReactProps } from "../props.js";

export interface TiptapNodeViewProps {
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
  stopEvent?: ((props: { event: Event }) => boolean) | null;
  ignoreMutation?:
    | ((props: { mutation: ViewMutationRecord }) => boolean)
    | null;
  contentDOMElementTag?: ElementType | undefined;
}

/**
 * Convert a Tiptap node view component to a React ProseMirror node view component
 *
 * Given a Tiptap-compatible React component and a Tiptap extension, returns
 * a React component that can be passed to React ProseMirror as a custom node view.
 *
 * Example:
 *
 * ```tsx
 * const nodeViews = {
 *   codeBlock: nodeView({
 *     component: function CodeBlock(nodeViewProps) {
 *       return (
 *         <AnnotatableNodeViewWrapper {...nodeViewProps}>
 *           <pre>
 *             <NodeViewContent as="code" />
 *           </pre>
 *         </AnnotatableNodeViewWrapper>
 *       )
 *     },
 *     extension: CodeBlockExtension,
 *   }),
 * }
 * ```
 */
export function tiptapNodeView({
  component: WrappedComponent,
  extension,
  as,
  className = "",
  attrs,
  contentDOMElementTag: InnerTag = "div",
  stopEvent,
  ignoreMutation,
}: TiptapNodeViewProps) {
  const TiptapNodeView = memo(
    forwardRef<HTMLElement | null, NodeViewComponentProps>(
      function TiptapNodeView({ children, nodeProps, ...props }, ref) {
        const { node, getPos, decorations, innerDecorations } = nodeProps;

        const OuterTag = (
          as ?? node.type.isInline ? "span" : "div"
        ) as ElementType;
        const { editor } = useCurrentEditor();
        const extensionManager = editor?.extensionManager ?? null;
        const extensions = extensionManager?.extensions ?? null;

        const selected = useIsNodeSelected();

        useStopEvent((_, event) => {
          if (stopEvent) {
            return stopEvent({ event });
          }

          return false;
        });

        useIgnoreMutation((_, mutation) => {
          if (ignoreMutation) {
            return ignoreMutation({ mutation });
          }

          return false;
        });

        // This is just a dummy ref to satisfy Tiptap's types
        const innerRef = useRef<HTMLElement>(null);

        const htmlAttributes = useMemo(() => {
          if (!extensions) return {};

          const attributes = getAttributesFromExtensions(extensions);
          const extensionAttributes = attributes.filter(
            (attribute) => attribute.type === extension.name
          );

          return getRenderedAttributes(node, extensionAttributes);
        }, [extensions, node]);

        const { extraClassName, htmlProps } = useMemo(() => {
          if (!attrs) return {};

          const resolvedAttrs =
            typeof attrs === "function"
              ? attrs({ node, HTMLAttributes: htmlAttributes })
              : attrs;

          const { className: extraClassName, ...htmlProps } =
            htmlAttrsToReactProps(resolvedAttrs);

          return { extraClassName, htmlProps };
        }, [htmlAttributes, node]);

        const finalClassName = cx(
          "react-renderer",
          `node-${node.type.name}`,
          className,
          extraClassName as string | undefined,
          { "ProseMirror-selectednode": selected }
        );

        const updateAttributes = useEditorEventCallback(
          (_, attributes: Record<string, unknown>) => {
            if (!editor) {
              return;
            }

            editor.commands.command(({ tr }) => {
              const pos = getPos();

              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                ...attributes,
              });

              return true;
            });
          }
        );

        const deleteNode = useEditorEventCallback(() => {
          if (!editor) {
            return;
          }

          const from = getPos();
          const to = from + node.nodeSize;

          editor.commands.deleteRange({ from, to });
        });

        const nodeViewContent = useMemo(
          () => (
            <InnerTag
              data-node-view-content-inner={node.type.name}
              style={{ whitespace: "inherit" }}
            >
              {children}
            </InnerTag>
          ),
          [children, node.type.name]
        );

        if (!editor) return null;

        return (
          <ReactNodeViewContentProvider content={nodeViewContent}>
            <OuterTag
              ref={ref}
              className={finalClassName}
              {...props}
              {...htmlProps}
            >
              <WrappedComponent
                ref={innerRef}
                node={node}
                getPos={getPos}
                view={editor.view}
                editor={editor}
                decorations={decorations}
                innerDecorations={innerDecorations}
                extension={extension}
                HTMLAttributes={htmlAttributes}
                selected={selected}
                updateAttributes={updateAttributes}
                deleteNode={deleteNode}
              />
            </OuterTag>
          </ReactNodeViewContentProvider>
        );
      }
    )
  );

  TiptapNodeView.displayName = `TiptapNodeView(${
    WrappedComponent.displayName ?? "Anonymous"
  })`;

  return TiptapNodeView;
}
