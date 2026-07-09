// @vitest-environment jsdom

/**
 * Tests for startup note loading in the note viewer.
 */

import { act } from "react";
import ReactDOM from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { saveNoteAction } from "@/lib/actions";
import type { Note } from "@/types";
import { toast } from "sonner";
import { NoteViewer } from "../NoteViewer";

const {
  getLastEditorProps,
  getLastRegenerateProps,
  setLastEditorProps,
  setLastRegenerateProps,
  setMockState,
  useStoreMock,
} = vi.hoisted(() => {
  let mockState: any;
  let lastRegenerateProps: any = null;
  let lastEditorProps: any = null;

  const useStoreMock: any = (selector?: (state: any) => unknown) => {
    return selector ? selector(mockState) : mockState;
  };

  useStoreMock.getState = () => mockState;

  return {
    setMockState: (nextState: any) => {
      mockState = nextState;
    },
    setLastRegenerateProps: (props: any) => {
      lastRegenerateProps = props;
    },
    getLastRegenerateProps: () => lastRegenerateProps,
    setLastEditorProps: (props: any) => {
      lastEditorProps = props;
    },
    getLastEditorProps: () => lastEditorProps,
    useStoreMock,
  };
});

vi.mock("@/components/editor/Regenerate", () => ({
  Regenerate: (props: any) => {
    setLastRegenerateProps(props);
    return null;
  },
}));

vi.mock("@/components/editor/UnsavedChangesDialog", () => ({
  UnsavedChangesDialog: () => null,
}));

vi.mock("@/components/notes/MoveNoteModal", () => ({
  MoveNoteModal: () => null,
}));

vi.mock("@/components/notes/TagPicker", () => ({
  TagPicker: () => null,
}));

vi.mock("@/components/tiptap/CharacterCount", () => ({
  CharacterCount: () => null,
}));

vi.mock("@/components/tiptap/TiptapEditor", () => ({
  TiptapEditor: (props: any) => {
    setLastEditorProps(props);
    return <div data-testid="tiptap-editor" />;
  },
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/calendar", () => ({
  Calendar: () => <div />,
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/hooks/useNoteActions", () => ({
  useNoteActions: () => ({
    isRegeneratingTitle: false,
    isRegeneratingSummary: false,
    isRegeneratingDirectory: false,
  }),
}));

vi.mock("@/lib/actions", () => ({
  saveNoteAction: vi.fn(),
}));

vi.mock("@/lib/images", () => ({
  discardPendingManagedImageFiles: vi.fn(),
  extractManagedImagePathsFromContent: vi.fn(() => []),
}));

vi.mock("@/lib/tagNames", () => ({
  resolveTagIdsFromNames: vi.fn(),
}));

vi.mock("@/store/helpers", () => ({
  getDirectoryPathResolver: vi.fn(() => ({
    getPath: vi.fn(() => []),
    getPathLabel: vi.fn(() => ""),
  })),
}));

vi.mock("@/store/slices/notes", () => ({
  getNoteContentFromStore: vi.fn(() => ""),
  setNoteContentInStore: vi.fn(),
}));

vi.mock("@/store/useStore", () => ({
  useStore: useStoreMock,
}));

vi.mock("lucide-react", () => {
  const Icon = () => <svg />;

  return {
    ArrowDownToLine: Icon,
    ArrowUpToLine: Icon,
    Calendar: Icon,
    Check: Icon,
    ChevronDown: Icon,
    Clock: Icon,
    Edit2: Icon,
    EyeOff: Icon,
    Folder: Icon,
    Link2: Icon,
    RefreshCw: Icon,
    Save: Icon,
    Sparkles: Icon,
    X: Icon,
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

function createNote(id: string): Note {
  return {
    id,
    title: "Persisted note",
    summary: "",
    content: "",
    directoryId: null,
    tagIds: [],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    isContentLoaded: false,
  };
}

function createState(overrides?: Partial<any>) {
  return {
    directories: [],
    tags: [],
    selectedNoteId: "note-1",
    pendingNoteId: undefined,
    pendingCloseNoteId: undefined,
    showSummary: false,
    currentNoteBacklinks: [],
    currentNoteOutgoingLinks: [],
    notesById: new Map<string, Note>(),
    contentScale: "base",
    codeWrapEnabled: false,
    aiMenuMode: "selection" as const,
    setAiMenuMode: vi.fn(),
    toolbarGroups: {
      history: true,
      headings: true,
      formatting: true,
      lists: true,
      block: true,
      insert: true,
      tools: true,
    },
    setSelectedNoteId: vi.fn(),
    updateNote: vi.fn(),
    loadNoteContent: vi.fn().mockResolvedValue(undefined),
    loadNoteLinks: vi.fn().mockResolvedValue(undefined),
    setHasUnsavedChanges: vi.fn(),
    setSaveCurrentNote: vi.fn(),
    confirmNoteSelection: vi.fn(),
    cancelNoteSelection: vi.fn(),
    closeNote: vi.fn(),
    cancelCloseNote: vi.fn(),
    toggleSummary: vi.fn(),
    setNoteTagIds: vi.fn(),
    ...overrides,
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("NoteViewer", () => {
  let container: HTMLDivElement;
  let root: ReactDOM.Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    container = document.createElement("div");
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
    vi.clearAllMocks();
    setLastRegenerateProps(null);
    setLastEditorProps(null);
    vi.mocked(saveNoteAction).mockResolvedValue({
      success: true,
      directoryId: null,
      warnings: [],
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await flushPromises();
    });

    container.remove();
  });

  it("Should retry loading note content once the restored note becomes available", async () => {
    const initialState = createState();
    setMockState(initialState);

    await act(async () => {
      root.render(<NoteViewer />);
      await flushPromises();
    });

    expect(initialState.loadNoteContent).not.toHaveBeenCalled();

    const nextState = createState({
      loadNoteContent: initialState.loadNoteContent,
      notesById: new Map([["note-1", createNote("note-1")]]),
    });
    setMockState(nextState);

    await act(async () => {
      root.render(<NoteViewer />);
      await flushPromises();
    });

    expect(initialState.loadNoteContent).toHaveBeenCalledTimes(1);
    expect(initialState.loadNoteContent).toHaveBeenCalledWith("note-1");
  });

  it("Should persist regenerated title and summary without saving editor body changes", async () => {
    const note = createNote("note-1");
    const setHasUnsavedChanges = vi.fn();
    const updateNote = vi.fn();
    const initialState = createState({
      notesById: new Map([["note-1", note]]),
      showSummary: true,
      setHasUnsavedChanges,
      updateNote,
    });
    setMockState(initialState);

    await act(async () => {
      root.render(<NoteViewer />);
      await flushPromises();
    });

    await act(async () => {
      getLastEditorProps().onChange();
      await flushPromises();
    });

    await act(async () => {
      await getLastRegenerateProps().onMetadataApply({
        title: "Regenerated title",
        summary: "Regenerated summary",
      });
      await flushPromises();
    });

    expect(saveNoteAction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "note-1",
        title: "Regenerated title",
        summary: "Regenerated summary",
        content: "",
      }),
    );
    expect(updateNote).toHaveBeenCalledWith(
      "note-1",
      expect.objectContaining({
        title: "Regenerated title",
        summary: "Regenerated summary",
      }),
    );
    expect(container.textContent).toContain("Regenerated title");
    expect(container.textContent).toContain("Regenerated summary");

    const updatedState = createState({
      notesById: new Map([
        [
          "note-1",
          {
            ...note,
            title: "Regenerated title",
            summary: "Regenerated summary",
          },
        ],
      ]),
      showSummary: true,
      setHasUnsavedChanges,
      updateNote,
    });
    setMockState(updatedState);

    await act(async () => {
      root.render(<NoteViewer />);
      await flushPromises();
    });

    expect(setHasUnsavedChanges).toHaveBeenLastCalledWith(true);
  });

  it("Should keep local metadata unchanged when regenerate metadata persistence fails", async () => {
    const note = createNote("note-1");
    const updateNote = vi.fn();
    const initialState = createState({
      notesById: new Map([["note-1", note]]),
      showSummary: true,
      updateNote,
    });
    setMockState(initialState);
    vi.mocked(saveNoteAction).mockRejectedValueOnce(new Error("save failed"));

    await act(async () => {
      root.render(<NoteViewer />);
      await flushPromises();
    });

    await expect(
      getLastRegenerateProps().onMetadataApply({
        title: "Broken title",
        summary: "Broken summary",
      }),
    ).rejects.toThrow("save failed");

    expect(updateNote).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Persisted note");
    expect(container.textContent).not.toContain("Broken title");
    expect(toast.error).toHaveBeenCalledWith("save failed");
  });
});
