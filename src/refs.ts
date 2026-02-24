import { MutableRefObject, Ref, RefCallback } from "react";

let hasWarned = false;

export function mergeDomRefs<Value>(...refs: Ref<Value>[]): RefCallback<Value> {
  const refObjects = refs.filter(
    (ref): ref is MutableRefObject<Value> =>
      typeof ref === "object" && ref !== null
  );

  if (!hasWarned && refObjects.length !== refs.length) {
    console.error(
      `@handlewithcare/react-prosemirror's mergeDomRefs only accepts ref objects. Non-object refs (null or callbacks) will be skipped.`
    );
    hasWarned = true;
  }

  return (value: Value) => {
    refObjects.forEach((ref) => {
      ref.current = value;
    });
  };
}
