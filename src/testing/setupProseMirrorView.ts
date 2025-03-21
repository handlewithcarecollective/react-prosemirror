/* Copyright (c) The New York Times Company */
let oldElementFromPoint: undefined | ((x: number, y: number) => Element | null);
let oldGetClientRects: undefined | (() => DOMRectList);
let oldGetBoundingClientRect: undefined | (() => DOMRect);

const mockElementFromPoint = () => globalThis.document.body;
const mockGetBoundingClientRect = (): DOMRect => {
  return {
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: 0,
    y: 0,
    toJSON() {
      return {
        bottom: 0,
        height: 0,
        left: 0,
        right: 0,
        top: 0,
        width: 0,
        x: 0,
        y: 0,
      };
    },
  };
};
const mockGetClientRects = () => {
  const list = [
    {
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      top: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON() {
        return {
          bottom: 0,
          height: 0,
          left: 0,
          right: 0,
          top: 0,
          width: 0,
          x: 0,
          y: 0,
        };
      },
    },
  ];
  const domRectList = Object.assign(list, {
    item(index: number) {
      return list[index] ?? null;
    },
  });
  return domRectList;
};

export function setupProseMirrorView() {
  oldElementFromPoint = Document.prototype.elementFromPoint;
  Document.prototype.elementFromPoint = mockElementFromPoint;

  oldGetClientRects = Range.prototype.getClientRects;
  Range.prototype.getClientRects = mockGetClientRects;

  oldGetBoundingClientRect = Range.prototype.getBoundingClientRect;
  Range.prototype.getBoundingClientRect = mockGetBoundingClientRect;
}

export function teardownProseMirrorView() {
  // @ts-expect-error jsdom actually doesn't implement these, so they might be undefined
  Document.prototype.elementFromPoint = oldElementFromPoint;
  // @ts-expect-error jsdom actually doesn't implement these, so they might be undefined
  Range.prototype.getClientRects = oldGetClientRects;
  // @ts-expect-error jsdom actually doesn't implement these, so they might be undefined
  Range.prototype.getBoundingClientRect = oldGetBoundingClientRect;
}
