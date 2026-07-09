// @vitest-environment jsdom

/**
 * Tests for debounced character-count updates in the Tiptap footer.
 */

import { act } from "react";
import ReactDOM from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { editorMock, setStoreState, useStoreMock } = vi.hoisted(() => {
  let storeState: any;
  let characters = 5;
  let words = 2;
  const listeners = new Map<string, Set<(payload: any) => void>>();

  const editorMock = {
    storage: {
      characterCount: {
        characters: vi.fn(() => characters),
        words: vi.fn(() => words),
      },
    },
    on: vi.fn((event: string, callback: (payload: any) => void) => {
      const callbacks = listeners.get(event) ?? new Set();
      callbacks.add(callback);
      listeners.set(event, callbacks);
    }),
    off: vi.fn((event: string, callback: (payload: any) => void) => {
      listeners.get(event)?.delete(callback);
    }),
  };

  const useStoreMock: any = (selector?: (state: any) => unknown) => {
    return selector ? selector(storeState) : storeState;
  };

  return {
    editorMock: Object.assign(editorMock, {
      emitTransaction: (docChanged: boolean) => {
        listeners
          .get("transaction")
          ?.forEach((callback) => callback({ transaction: { docChanged } }));
      },
      setCounts: (nextCharacters: number, nextWords: number) => {
        characters = nextCharacters;
        words = nextWords;
      },
      resetListeners: () => {
        listeners.clear();
      },
    }),
    setStoreState: (nextState: any) => {
      storeState = nextState;
    },
    useStoreMock,
  };
});

vi.mock("@/store/useStore", () => ({
  useStore: useStoreMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { CharacterCount } from "../CharacterCount";

describe("CharacterCount", () => {
  let container: HTMLDivElement;
  let root: ReactDOM.Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    vi.useFakeTimers();
    vi.clearAllMocks();
    editorMock.resetListeners();
    editorMock.setCounts(5, 2);
    setStoreState({
      showCharacterCount: true,
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });

    vi.useRealTimers();
    container.remove();
  });

  it("Should refresh counts after a document-changing transaction", async () => {
    await act(async () => {
      root.render(<CharacterCount editor={editorMock as any} />);
    });

    expect(container.textContent).toContain("5");
    expect(container.textContent).toContain("2");

    editorMock.setCounts(12, 4);

    await act(async () => {
      editorMock.emitTransaction(true);
      vi.advanceTimersByTime(150);
    });

    expect(container.textContent).toContain("12");
    expect(container.textContent).toContain("4");
  });

  it("Should ignore selection-only transactions", async () => {
    await act(async () => {
      root.render(<CharacterCount editor={editorMock as any} />);
    });

    editorMock.setCounts(20, 7);

    await act(async () => {
      editorMock.emitTransaction(false);
      vi.advanceTimersByTime(150);
    });

    expect(container.textContent).toContain("5");
    expect(container.textContent).toContain("2");
  });
});
