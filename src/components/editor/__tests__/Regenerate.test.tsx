// @vitest-environment jsdom

/**
 * Tests for regenerate review/apply behavior.
 */

import type { ReactNode } from "react";
import { act } from "react";
import ReactDOM from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toast } from "sonner";

import { Regenerate } from "../Regenerate";

function createDeferredPromise() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

const { regenerateMock, setMockState, useStoreMock } = vi.hoisted(() => {
  let mockState: any;
  const regenerateMock = vi.fn();

  const useStoreMock: any = (selector?: (state: any) => unknown) => {
    return selector ? selector(mockState) : mockState;
  };

  useStoreMock.getState = () => mockState;

  return {
    regenerateMock,
    setMockState: (nextState: any) => {
      mockState = nextState;
    },
    useStoreMock,
  };
});

vi.mock("@/components/editor/ModelSelectDropdown", () => ({
  ModelSelectDropdown: () => <div />,
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  TooltipTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/hooks/useNoteActions", () => ({
  useNoteActions: () => ({
    regenerate: regenerateMock,
    cancelRegenerate: vi.fn(),
    isRegeneratingTitle: false,
    isRegeneratingSummary: false,
    isRegeneratingDirectory: false,
    isRegeneratingTags: false,
  }),
}));

vi.mock("@/store/useStore", () => ({
  useStore: useStoreMock,
}));

vi.mock("lucide-react", () => {
  const Icon = () => <svg />;

  return {
    ArrowLeft: Icon,
    Check: Icon,
    ChevronRight: Icon,
    FileText: Icon,
    Folder: Icon,
    FolderTree: Icon,
    Loader2: Icon,
    Sparkles: Icon,
    Tag: Icon,
    Type: Icon,
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

function createState(overrides?: Partial<any>) {
  return {
    moveNote: vi.fn().mockResolvedValue(undefined),
    tags: [],
    includeExistingDirs: false,
    setIncludeExistingDirs: vi.fn(),
    ...overrides,
  };
}

function getButton(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll("button")).find(
    (element) => element.textContent?.includes(label),
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`);
  }

  return button;
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("Regenerate", () => {
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
    regenerateMock.mockResolvedValue({
      title: "Regenerated title",
      summary: "Regenerated summary",
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await flushPromises();
    });

    container.remove();
  });

  it("Should wait for async metadata apply before showing success", async () => {
    const applyDeferred = createDeferredPromise();
    const onMetadataApply = vi.fn().mockReturnValue(applyDeferred.promise);
    const onClose = vi.fn();
    setMockState(createState());

    await act(async () => {
      root.render(
        <Regenerate
          isOpen={true}
          onClose={onClose}
          content="Body"
          onMetadataApply={onMetadataApply}
          noteId="note-1"
          currentTitle="Old title"
          currentSummary="Old summary"
          currentDirectoryPath={[]}
        />,
      );
      await flushPromises();
    });

    await act(async () => {
      getButton("note.regenerateSelected").click();
      await flushPromises();
    });

    await act(async () => {
      getButton("note.applyChanges").click();
      await flushPromises();
    });

    expect(onMetadataApply).toHaveBeenCalledWith({
      title: "Regenerated title",
      summary: "Regenerated summary",
    });
    expect(toast.success).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      applyDeferred.resolve();
      await flushPromises();
    });

    expect(toast.success).toHaveBeenCalledWith("note.regeneratedSuccessfully");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Should await metadata, tags, and catalog updates in order", async () => {
    const order: string[] = [];
    const metadataDeferred = createDeferredPromise();
    const tagsDeferred = createDeferredPromise();
    const moveDeferred = createDeferredPromise();
    const moveNote = vi.fn().mockImplementation(async () => {
      order.push("catalog");
      await moveDeferred.promise;
    });
    const onMetadataApply = vi.fn().mockImplementation(async () => {
      order.push("metadata");
      await metadataDeferred.promise;
    });
    const onTagsUpdate = vi.fn().mockImplementation(async () => {
      order.push("tags");
      await tagsDeferred.promise;
    });
    setMockState(createState({ moveNote }));
    regenerateMock.mockResolvedValueOnce({
      title: "Regenerated title",
      summary: "Regenerated summary",
      tags: ["alpha", "beta"],
      catalog: ["Projects", "ZeroSort"],
    });

    await act(async () => {
      root.render(
        <Regenerate
          isOpen={true}
          onClose={vi.fn()}
          content="Body"
          onMetadataApply={onMetadataApply}
          onTagsUpdate={onTagsUpdate}
          noteId="note-1"
          currentTitle="Old title"
          currentSummary="Old summary"
          currentDirectoryPath={[]}
          currentTagNames={[]}
        />,
      );
      await flushPromises();
    });

    await act(async () => {
      getButton("note.regenerateSelected").click();
      await flushPromises();
    });

    await act(async () => {
      getButton("note.applyChanges").click();
      await flushPromises();
    });

    expect(order).toEqual(["metadata"]);
    expect(toast.success).not.toHaveBeenCalled();

    await act(async () => {
      metadataDeferred.resolve();
      await flushPromises();
    });

    expect(order).toEqual(["metadata", "tags"]);
    expect(moveNote).not.toHaveBeenCalled();

    await act(async () => {
      tagsDeferred.resolve();
      await flushPromises();
    });

    expect(order).toEqual(["metadata", "tags", "catalog"]);
    expect(moveNote).toHaveBeenCalledWith("note-1", ["Projects", "ZeroSort"]);
    expect(toast.success).not.toHaveBeenCalled();

    await act(async () => {
      moveDeferred.resolve();
      await flushPromises();
    });

    expect(toast.success).toHaveBeenCalledWith("note.regeneratedSuccessfully");
  });
});
