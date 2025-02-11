/* Copyright (c) The New York Times Company */
/* eslint-disable @typescript-eslint/no-empty-function */
import { render } from "@testing-library/react";
import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import React from "react";

import { LayoutGroup } from "../../components/LayoutGroup.js";
import { EditorContext } from "../../contexts/EditorContext.js";
import { EditorStateContext } from "../../contexts/EditorStateContext.js";
import { useEditorEffect } from "../useEditorEffect.js";

function TestComponent({
  effect,
  dependencies = [],
}: {
  effect: () => void;
  dependencies?: unknown[];
}) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEditorEffect(effect, dependencies);
  return null;
}

describe("useEditorViewLayoutEffect", () => {
  it("should run the effect", () => {
    const effect = jest.fn();
    const editorView = { docView: {} } as unknown as EditorView;
    const editorState = {} as EditorState;
    const registerEventListener = () => {};
    const unregisterEventListener = () => {};
    const flushSyncRef = { current: true };

    render(
      <LayoutGroup>
        <EditorContext.Provider
          value={{
            view: editorView,
            registerEventListener,
            unregisterEventListener,
            flushSyncRef,
          }}
        >
          <EditorStateContext.Provider value={editorState}>
            <TestComponent effect={effect} />
          </EditorStateContext.Provider>
        </EditorContext.Provider>
      </LayoutGroup>
    );

    expect(effect).toHaveBeenCalled();
    expect(effect).toHaveBeenCalledWith(editorView);
  });

  it("should not re-run the effect if no dependencies change", () => {
    const effect = jest.fn();
    const editorView = { docView: {} } as unknown as EditorView;
    const editorState = {} as EditorState;
    const registerEventListener = () => {};
    const unregisterEventListener = () => {};

    const contextValue = {
      view: editorView,
      registerEventListener,
      unregisterEventListener,
      flushSyncRef: { current: true },
    };

    const { rerender } = render(
      <LayoutGroup>
        <EditorContext.Provider value={contextValue}>
          <EditorStateContext.Provider value={editorState}>
            <TestComponent effect={effect} dependencies={[]} />
          </EditorStateContext.Provider>{" "}
        </EditorContext.Provider>
      </LayoutGroup>
    );

    rerender(
      <LayoutGroup>
        <EditorContext.Provider value={contextValue}>
          <EditorStateContext.Provider value={editorState}>
            <TestComponent effect={effect} dependencies={[]} />
          </EditorStateContext.Provider>
        </EditorContext.Provider>
      </LayoutGroup>
    );

    expect(effect).toHaveBeenCalledTimes(1);
  });

  it("should re-run the effect if dependencies change", () => {
    const effect = jest.fn();
    const editorView = { docView: {} } as unknown as EditorView;
    const editorState = {} as EditorState;
    const registerEventListener = () => {};
    const unregisterEventListener = () => {};

    const { rerender } = render(
      <LayoutGroup>
        <EditorContext.Provider
          value={{
            view: editorView,
            registerEventListener,
            unregisterEventListener,
            flushSyncRef: { current: true },
          }}
        >
          <EditorStateContext.Provider value={editorState}>
            <TestComponent effect={effect} dependencies={["one"]} />
          </EditorStateContext.Provider>
        </EditorContext.Provider>
      </LayoutGroup>
    );

    rerender(
      <LayoutGroup>
        <EditorContext.Provider
          value={{
            view: editorView,
            registerEventListener,
            unregisterEventListener,
            flushSyncRef: { current: true },
          }}
        >
          <EditorStateContext.Provider value={editorState}>
            <TestComponent effect={effect} dependencies={["two"]} />
          </EditorStateContext.Provider>
        </EditorContext.Provider>
      </LayoutGroup>
    );

    expect(effect).toHaveBeenCalledTimes(2);
  });
});
