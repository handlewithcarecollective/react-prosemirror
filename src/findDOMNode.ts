import { Component } from "react";
//@ts-expect-error This module isn't typed
import { findCurrentHostFiber } from "react-reconciler/reflection";

// https://github.com/facebook/react/blob/main/packages/shared/ReactInstanceMap.js#L18
export function getInstance(key: Component) {
  return (key as Component & { _reactInternals: unknown })._reactInternals;
}

// https://github.com/facebook/react/blob/main/packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js#L167
type PublicInstance = Element | Text;

// https://github.com/facebook/react/blob/main/packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js#L322
function getPublicInstance(instance: PublicInstance): PublicInstance {
  return instance;
}

// https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiberReconciler.js#L153
function findHostInstance(component: Component): PublicInstance | null {
  const fiber = getInstance(component);
  if (fiber === undefined) {
    if (typeof component.render === "function") {
      throw new Error("Unable to find node on an unmounted component.");
    } else {
      const keys = Object.keys(component).join(",");
      throw new Error(
        `Argument appears to not be a ReactComponent. Keys: ${keys}`
      );
    }
  }
  const hostFiber = findCurrentHostFiber(fiber);
  if (hostFiber === null) {
    return null;
  }
  return getPublicInstance(hostFiber.stateNode);
}

// https://github.com/facebook/react/blob/main/packages/react-dom/src/client/ReactDOMClient.js#L43
export function findDOMNode(
  componentOrElement: Component<unknown, unknown>
): null | Element | Text {
  return findHostInstance(componentOrElement);
}
