import { Mark } from "prosemirror-model";
import { AllHTMLAttributes, LegacyRef } from "react";

export interface MarkViewComponentProps extends AllHTMLAttributes<HTMLElement> {
  markProps: {
    mark: Mark;
    inline: boolean;
    getPos: () => number;
  };
  // It's not really feasible to correctly type a Ref constraint,
  // because it needs to be both covariant and contravariant (because
  // it could be either a RefObject or a RefCallback). So we use any,
  // here, instead of a more useful type like HTMLElement | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ref: LegacyRef<any>;
}
