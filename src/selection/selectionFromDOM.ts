import { ResolvedPos } from "prosemirror-model";
import { NodeSelection, TextSelection } from "prosemirror-state";

import { ReactEditorView } from "../ReactEditorView.js";
import { isOnEdge, selectionCollapsed } from "../dom.js";
import { NodeViewDesc } from "../viewdesc.js";

export function selectionBetween(
  view: ReactEditorView,
  $anchor: ResolvedPos,
  $head: ResolvedPos,
  bias?: number
) {
  return (
    view.someProp("createSelectionBetween", (f) => f(view, $anchor, $head)) ||
    TextSelection.between($anchor, $head, bias)
  );
}

export function selectionFromDOM(
  view: ReactEditorView,
  origin: string | null = null
) {
  const domSel = view.domSelectionRange(),
    doc = view.state.doc;
  if (!domSel.focusNode) return null;
  let nearestDesc = view.docView.nearestDesc(domSel.focusNode);
  const inWidget = nearestDesc && nearestDesc.size == 0;
  let head = view.docView.posFromDOM(domSel.focusNode, domSel.focusOffset, 1);
  if (head < 0) return null;
  let $head = doc.resolve(head),
    anchor,
    selection;
  if (selectionCollapsed(domSel)) {
    anchor = head;
    while (nearestDesc && !nearestDesc.node) nearestDesc = nearestDesc.parent;
    const nearestDescNode = (nearestDesc as NodeViewDesc).node;
    if (
      nearestDesc &&
      nearestDescNode.isAtom &&
      NodeSelection.isSelectable(nearestDescNode) &&
      nearestDesc.parent &&
      !(
        nearestDescNode.isInline &&
        isOnEdge(domSel.focusNode, domSel.focusOffset, nearestDesc.dom)
      )
    ) {
      const pos = nearestDesc.posBefore;
      selection = new NodeSelection(head == pos ? $head : doc.resolve(pos));
    }
  } else {
    if (
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      domSel instanceof view.dom.ownerDocument.defaultView!.Selection &&
      domSel.rangeCount > 1
    ) {
      let min = head,
        max = head;
      for (let i = 0; i < domSel.rangeCount; i++) {
        const range = domSel.getRangeAt(i);
        min = Math.min(
          min,
          view.docView.posFromDOM(range.startContainer, range.startOffset, 1)
        );
        max = Math.max(
          max,
          view.docView.posFromDOM(range.endContainer, range.endOffset, -1)
        );
      }
      if (min < 0) return null;
      [anchor, head] =
        max == view.state.selection.anchor ? [max, min] : [min, max];
      $head = doc.resolve(head);
    } else {
      anchor = view.docView.posFromDOM(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        domSel.anchorNode!,
        domSel.anchorOffset,
        1
      );
    }
    if (anchor < 0) return null;
  }
  const $anchor = doc.resolve(anchor);

  if (!selection) {
    const bias =
      origin == "pointer" ||
      (view.state.selection.head < $head.pos && !inWidget)
        ? 1
        : -1;
    selection = selectionBetween(view, $anchor, $head, bias);
  }
  return selection;
}
