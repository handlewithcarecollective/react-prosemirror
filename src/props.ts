import cx from "classnames";
import { HTMLProps } from "react";

let patched = false;

function patchConsoleError() {
  if (patched) return;
  /* eslint-disable no-console */
  const consoleError = console.error;
  console.error = function (...data: unknown[]) {
    const [message, prop, correction] = data;
    if (
      typeof message === "string" &&
      message.includes("Invalid DOM property `%s`. Did you mean `%s`?") &&
      prop === "STYLE" &&
      correction === "style"
    ) {
      return;
    }
    consoleError(...data);
  };
  patched = true;
  /* eslint-enable no-console */
}

function mergeStyleProps(a: HTMLProps<HTMLElement>, b: HTMLProps<HTMLElement>) {
  if (!("STYLE" in a)) {
    if (!("STYLE" in b)) {
      return undefined;
    }
    return b.STYLE as string;
  }
  if (!("STYLE" in b)) {
    return a.STYLE as string;
  }
  return `${(a.STYLE as string).match(/;\s*$/) ? a.STYLE : `${a.STYLE}`} ${
    b.STYLE
  }`;
}

/**
 * Merges two sets of React props. Class names
 * will be concatenated and style objects
 * will be merged.
 */
export function mergeReactProps(
  a: HTMLProps<HTMLElement>,
  b: HTMLProps<HTMLElement>
) {
  return {
    ...a,
    ...b,
    className: cx(a.className, b.className),
    STYLE: mergeStyleProps(a, b),
    style: {
      ...a.style,
      ...b.style,
    },
  };
}

/**
 * Given a record of HTML attributes, returns tho
 * equivalent React props.
 */
export function htmlAttrsToReactProps(
  attrs: Record<string, string>
): HTMLProps<HTMLElement> {
  patchConsoleError();
  const props: Record<string, unknown> = {};
  for (const [attrName, attrValue] of Object.entries(attrs)) {
    switch (attrName.toLowerCase()) {
      case "class": {
        props.className = attrValue;
        break;
      }
      case "style": {
        // HACK: React expects the `style` prop to be an
        // object mapping from CSS property name to value.
        // However, it will pass un-recognized props through
        // to the underlying DOM element, and HTML attributes
        // are case insensitive. So we use `STYLE` instead,
        // which React doesn't intercept, but the DOM treats
        // as `style`
        props.STYLE = attrValue;
        break;
      }
      case "autocapitalize": {
        props.autoCapitalize = attrValue;
        break;
      }
      case "contenteditable": {
        if (attrValue === "" || attrValue === "true") {
          props.contentEditable = true;
          break;
        }
        if (attrValue === "false") {
          props.contentEditable = false;
          break;
        }
        if (attrValue === "plaintext-only") {
          props.contentEditable = "plaintext-only";
          break;
        }
        props.contentEditable = null;
        break;
      }
      case "draggable": {
        props.draggable = attrValue != null;
        break;
      }
      case "enterkeyhint": {
        props.enterKeyHint = attrValue;
        break;
      }
      case "for": {
        props.htmlFor = attrValue;
        break;
      }
      case "hidden": {
        props.hidden = attrValue;
        break;
      }
      case "inputmode": {
        props.inputMode = attrValue;
        break;
      }
      case "itemprop": {
        props.itemProp = attrValue;
        break;
      }
      case "spellcheck": {
        if (attrValue === "" || attrValue === "true") {
          props.spellCheck = true;
          break;
        }
        if (attrValue === "false") {
          props.spellCheck = false;
          break;
        }
        props.spellCheck = null;
        break;
      }
      case "tabindex": {
        const numValue = parseInt(attrValue, 10);
        if (!Number.isNaN(numValue)) {
          props.tabIndex = numValue;
        }
        break;
      }
      case "autocomplete": {
        props.autoComplete = attrValue;
        break;
      }
      case "autofocus": {
        props.autoFocus = attrValue != null;
        break;
      }
      case "formaction": {
        props.formAction = attrValue;
        break;
      }
      case "formenctype": {
        props.formEnctype = attrValue;
        break;
      }
      case "formmethod": {
        props.formMethod = attrValue;
        break;
      }
      case "formnovalidate": {
        props.formNoValidate = attrValue;
        break;
      }
      case "formtarget": {
        props.formTarget = attrValue;
        break;
      }
      case "maxlength": {
        const numValue = parseInt(attrValue, 10);
        if (!Number.isNaN(numValue)) {
          props.maxLength = attrValue;
        }
        break;
      }
      case "minlength": {
        const numValue = parseInt(attrValue, 10);
        if (!Number.isNaN(numValue)) {
          props.minLength = attrValue;
        }
        break;
      }
      case "max": {
        const numValue = parseInt(attrValue, 10);
        if (!Number.isNaN(numValue)) {
          props.max = attrValue;
        }
        break;
      }
      case "min": {
        const numValue = parseInt(attrValue, 10);
        if (!Number.isNaN(numValue)) {
          props.min = attrValue;
        }
        break;
      }
      case "multiple": {
        props.multiple = attrValue != null;
        break;
      }
      case "readonly": {
        props.readOnly = attrValue != null;
        break;
      }
      case "required": {
        props.required = attrValue != null;
        break;
      }
      case "size": {
        const numValue = parseInt(attrValue, 10);
        if (!Number.isNaN(numValue)) {
          props.size = attrValue;
        }
        break;
      }
      case "step": {
        if (attrValue === "any") {
          props.step = attrValue;
          break;
        }
        const numValue = parseInt(attrValue, 10);
        if (!Number.isNaN(numValue) && numValue > 0) {
          props.step = attrValue;
        }
        break;
      }
      case "disabled": {
        props.disabled = attrValue != null;
        break;
      }
      case "rows": {
        const numValue = parseInt(attrValue, 10);
        if (!Number.isNaN(numValue)) {
          props.rows = attrValue;
        }
        break;
      }
      default: {
        props[attrName] = attrValue;
        break;
      }
    }
  }
  return props;
}
