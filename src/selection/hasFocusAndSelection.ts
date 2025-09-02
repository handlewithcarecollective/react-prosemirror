import { ReactEditorView } from "../ReactEditorView.js";

export function hasFocusAndSelection(view: ReactEditorView) {
  if (view.editable && !view.hasFocus()) return false;
  return hasSelection(view);
}

export function hasSelection(view: ReactEditorView) {
  const sel = view.domSelectionRange();
  if (!sel.anchorNode) return false;
  try {
    // Firefox will raise 'permission denied' errors when accessing
    // properties of `sel.anchorNode` when it's in a generated CSS
    // element.
    return (
      view.dom.contains(
        sel.anchorNode.nodeType == 3
          ? sel.anchorNode.parentNode
          : sel.anchorNode
      ) &&
      (view.editable ||
        view.dom.contains(
          sel.focusNode?.nodeType == 3
            ? sel.focusNode?.parentNode
            : sel.focusNode
        ))
    );
  } catch (_) {
    return false;
  }
}
