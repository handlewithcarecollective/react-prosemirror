import cx from "classnames";
import { generate, parse } from "css-tree";
import { HTMLProps } from "react";

export function kebabCaseToCamelCase(str: string) {
  return str.replaceAll(/-[a-z]/g, (g) => g[1]?.toUpperCase() ?? "");
}

/**
 * Converts a CSS style string to an object
 * that can be passed to a React component's
 * `style` prop.
 */
export function cssToStyles(css: string) {
  const ast = parse(`* { ${css} }`);

  if (ast.type !== "StyleSheet") return {};

  const rule = ast.children.first;
  if (rule?.type !== "Rule") return {};

  const block = rule.block;
  const styles: Record<string, string> = {};

  for (const declaration of block.children) {
    if (declaration.type !== "Declaration") continue;
    const property = declaration.property;
    const value =
      declaration.value.type === "Raw"
        ? declaration.value.value
        : generate(declaration.value);
    const camelCasePropertyName = property.startsWith("--")
      ? property
      : kebabCaseToCamelCase(property);
    styles[camelCasePropertyName] = value;
  }

  return styles;
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
  const props: Record<string, unknown> = {};
  for (const [attrName, attrValue] of Object.entries(attrs)) {
    switch (attrName.toLowerCase()) {
      case "class": {
        props.className = attrValue;
        break;
      }
      case "style": {
        props.style = cssToStyles(attrValue);
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
