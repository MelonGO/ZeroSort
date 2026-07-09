// @vitest-environment jsdom

/**
 * Tests for NoteTabs store subscription granularity.
 */

import { act } from "react";
import ReactDOM from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Note } from "@/types";

const {
  attachStore,
  getRenderCount,
  incrementRenderCount,
  replaceStoreState,
  resetRenderCounts,
  updateStoreState,
} = vi.hoisted(() => {
  const renderCounts = new Map<string, number>();
  let storeApi: any;

  return {
    attachStore: (nextStoreApi: any) => {
      storeApi = nextStoreApi;
    },
    getRenderCount: (noteId: string) => renderCounts.get(noteId) ?? 0,
    incrementRenderCount: (noteId: string) => {
      renderCounts.set(noteId, (renderCounts.get(noteId) ?? 0) + 1);
    },
    replaceStoreState: (nextState: any) => {
      storeApi.setState(nextState, true);
    },
    resetRenderCounts: () => {
      renderCounts.clear();
    },
    updateStoreState: (updater: any) => {
      storeApi.setState(updater);
    },
  };
});

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");

  return {
    ...actual,
    memo: (component: any, arePropsEqual?: any) => {
      const Wrapped = (props: any) => {
        if (typeof props.noteId === "string") {
          incrementRenderCount(props.noteId);
        }

        return component(props);
      };

      Wrapped.displayName = component.displayName || component.name;

      return actual.memo(Wrapped, arePropsEqual);
    },
  };
});

vi.mock("@/store/useStore", async () => {
  const { create } = await vi.importActual<typeof import("zustand")>("zustand");

  const useStore = create<any>(() => ({}));
  attachStore(useStore);

  return { useStore };
});

vi.mock("lucide-react", () => ({
  X: () => <svg />,
}));

import { NoteTabs } from "../NoteTabs";

interface MockStoreState {
  confirmCloseNote: ReturnType<typeof vi.fn>;
  confirmNoteSelection: ReturnType<typeof vi.fn>;
  notesById: Map<string, Note>;
  openNoteIds: string[];
  reorderOpenNotes: ReturnType<typeof vi.fn>;
  selectedNoteId: string | null;
}

function createNote(id: string, overrides?: Partial<Note>): Note {
  return {
    id,
    title: `Note ${id}`,
    summary: "",
    content: "",
    directoryId: null,
    tagIds: [],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    isContentLoaded: false,
    contentVersion: 0,
    ...overrides,
  };
}

function createState(overrides?: Partial<MockStoreState>): MockStoreState {
  const note1 = createNote("note-1", { title: "First note" });
  const note2 = createNote("note-2", { title: "Second note" });
  const note3 = createNote("note-3", { title: "Third note" });

  return {
    confirmCloseNote: vi.fn(),
    confirmNoteSelection: vi.fn(),
    notesById: new Map([
      [note1.id, note1],
      [note2.id, note2],
      [note3.id, note3],
    ]),
    openNoteIds: [note1.id, note2.id, note3.id],
    reorderOpenNotes: vi.fn(),
    selectedNoteId: note1.id,
    ...overrides,
  };
}

describe("NoteTabs", () => {
  let container: HTMLDivElement;
  let root: ReactDOM.Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    container = document.createElement("div");
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
    replaceStoreState(createState());
    resetRenderCounts();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });

    container.remove();
  });

  it("Should only re-render the affected tab when its title changes", async () => {
    await act(async () => {
      root.render(<NoteTabs />);
    });

    resetRenderCounts();

    await act(async () => {
      updateStoreState((state: MockStoreState) => {
        const nextNotesById = new Map(state.notesById);
        const currentNote = nextNotesById.get("note-1");

        nextNotesById.set("note-1", {
          ...currentNote!,
          title: "Renamed first note",
        });

        return { notesById: nextNotesById };
      });
    });

    expect(container.textContent).toContain("Renamed first note");
    expect(getRenderCount("note-1")).toBeGreaterThan(0);
    expect(getRenderCount("note-2")).toBe(0);
    expect(getRenderCount("note-3")).toBe(0);
  });

  it("Should not re-render open tabs when an unrelated closed note changes", async () => {
    replaceStoreState(
      createState({
        openNoteIds: ["note-1", "note-2"],
      }),
    );

    await act(async () => {
      root.render(<NoteTabs />);
    });

    resetRenderCounts();

    await act(async () => {
      updateStoreState((state: MockStoreState) => {
        const nextNotesById = new Map(state.notesById);
        const currentNote = nextNotesById.get("note-3");

        nextNotesById.set("note-3", {
          ...currentNote!,
          isContentLoaded: true,
        });

        return { notesById: nextNotesById };
      });
    });

    expect(getRenderCount("note-1")).toBe(0);
    expect(getRenderCount("note-2")).toBe(0);
  });

  it("Should only re-render the previously active and newly active tabs when selection changes", async () => {
    await act(async () => {
      root.render(<NoteTabs />);
    });

    resetRenderCounts();

    await act(async () => {
      updateStoreState({ selectedNoteId: "note-2" });
    });

    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    const selectedTabs = tabs.filter(
      (tab) => tab.getAttribute("aria-selected") === "true",
    );

    expect(selectedTabs).toHaveLength(1);
    expect(selectedTabs[0]?.textContent).toContain("Second note");
    expect(getRenderCount("note-1")).toBeGreaterThan(0);
    expect(getRenderCount("note-2")).toBeGreaterThan(0);
    expect(getRenderCount("note-3")).toBe(0);
  });
});
