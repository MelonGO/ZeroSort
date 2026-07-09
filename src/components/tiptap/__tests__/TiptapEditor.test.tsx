// @vitest-environment jsdom

/**
 * Tests for deferred external content updates in the Tiptap editor.
 */

import { act } from "react";
import ReactDOM from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  blurMock,
  editorMock,
  setContentMock,
  setStoreState,
  setTextSelectionMock,
  updateStateMock,
  useStoreMock,
} = vi.hoisted(() => {
  let storeState: any;

  const setContentMock = vi.fn();
  const setTextSelectionMock = vi.fn();
  const blurMock = vi.fn();
  const updateStateMock = vi.fn();

  const editorMock = {
    commands: {
      blur: blurMock,
      setContent: setContentMock,
      setTextSelection: setTextSelectionMock,
    },
    state: {
      doc: {},
      plugins: [],
      schema: {},
      selection: {},
    },
    view: {
      updateState: updateStateMock,
    },
  };

  const useStoreMock: any = (selector?: (state: any) => unknown) => {
    return selector ? selector(storeState) : storeState;
  };

  useStoreMock.getState = () => storeState;

  return {
    blurMock,
    editorMock,
    setContentMock,
    setStoreState: (nextState: any) => {
      storeState = nextState;
    },
    setTextSelectionMock,
    updateStateMock,
    useStoreMock,
  };
});

vi.mock("@/components/tiptap/EditorToolbar", () => ({
  EditorToolbar: () => null,
}));

vi.mock("@/components/tiptap/heavyExtensions", () => ({
  getHeavyTiptapExtensions: () => [],
}));

vi.mock("@/components/tiptap/ImageEditModal", () => ({
  ImageEditModal: () => null,
}));

vi.mock("@/components/tiptap/MathEditModal", () => ({
  MathEditModal: () => null,
}));

vi.mock("@/components/tiptap/TableFloatingToolbar", () => ({
  TableFloatingToolbar: () => null,
}));

vi.mock("@/lib/images", () => ({
  isLegacyBase64ImageSrc: () => false,
  isManagedImagePath: () => false,
  saveManagedImageFile: vi.fn(),
}));

vi.mock("@/lib/tiptap/editorContentCache", () => ({
  getParsedEditorContent: (_noteId: string | undefined, content: string) => ({
    parsed: content,
  }),
}));

vi.mock("@/lib/tiptap/lowlight", () => ({
  tiptapLowlight: {},
}));

vi.mock("@/lib/utils", () => ({
  cn: (...values: Array<string | false | null | undefined>) =>
    values.filter(Boolean).join(" "),
}));

vi.mock("@/store/useStore", () => ({
  useStore: useStoreMock,
}));

vi.mock("@tiptap/pm/state", () => ({
  EditorState: {
    create: vi.fn(() => ({})),
  },
}));

vi.mock("@tiptap/react", () => ({
  EditorContent: () => <div data-testid="editor-content" />,
  useEditor: () => editorMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

vi.mock("../extensions", () => ({
  getBaseTiptapExtensions: () => [],
}));

import { TiptapEditor } from "../TiptapEditor";

function createStoreState() {
  return {
    codeWrapEnabled: false,
    contentScale: "base",
    aiMenuMode: "off" as const,
    openNoteIds: ["note-1", "note-2"],
    noteScrollPositions: {
      "note-1": 12,
      "note-2": 34,
    },
    setAiMenuMode: vi.fn(),
    setNoteScrollPosition: vi.fn(),
    toolbarGroups: {
      block: true,
      formatting: true,
      headings: true,
      history: true,
      insert: true,
      lists: true,
      tools: true,
    },
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("TiptapEditor", () => {
  let container: HTMLDivElement;
  let root: ReactDOM.Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    vi.useFakeTimers();
    vi.clearAllMocks();
    setStoreState(createStoreState());

    container = document.createElement("div");
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      vi.runOnlyPendingTimers();
      await flushMicrotasks();
    });

    vi.useRealTimers();
    container.remove();
  });

  it("Should defer note content replacement until a macrotask runs", async () => {
    await act(async () => {
      root.render(
        <TiptapEditor
          allowAiMenu={false}
          content='{"type":"doc","content":[{"type":"paragraph"}]}'
          noteId="note-1"
          onChange={vi.fn()}
        />,
      );
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(setContentMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    expect(setContentMock).toHaveBeenCalledTimes(1);
    expect(setContentMock).toHaveBeenCalledWith(
      { parsed: '{"type":"doc","content":[{"type":"paragraph"}]}' },
      { emitUpdate: false },
    );
    expect(setTextSelectionMock).toHaveBeenCalledWith(0);
    expect(blurMock).toHaveBeenCalledTimes(1);
    expect(updateStateMock).toHaveBeenCalledTimes(1);
  });

  it("Should cancel a pending note switch update before applying the next one", async () => {
    await act(async () => {
      root.render(
        <TiptapEditor
          allowAiMenu={false}
          content='{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"first"}]}]}'
          noteId="note-1"
          onChange={vi.fn()}
        />,
      );
    });

    await act(async () => {
      root.render(
        <TiptapEditor
          allowAiMenu={false}
          content='{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"second"}]}]}'
          noteId="note-2"
          onChange={vi.fn()}
        />,
      );
    });

    expect(setContentMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    expect(setContentMock).toHaveBeenCalledTimes(1);
    expect(setContentMock).toHaveBeenCalledWith(
      {
        parsed:
          '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"second"}]}]}',
      },
      { emitUpdate: false },
    );
  });
});
