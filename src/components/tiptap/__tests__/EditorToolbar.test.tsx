// @vitest-environment jsdom

/**
 * Tests for editor toolbar commands that interact with browser APIs.
 */

import { act } from "react";
import ReactDOM from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock("@/components/tiptap/ColorPicker", () => ({
  ColorPicker: () => null,
  HIGHLIGHT_COLORS: [],
  TEXT_COLORS: [],
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...values: Array<string | false | null | undefined>) =>
    values.filter(Boolean).join(" "),
}));

vi.mock("react-i18next", async () => {
  const actual =
    await vi.importActual<typeof import("react-i18next")>("react-i18next");

  const useTranslation: typeof actual.useTranslation = () => {
    const t = ((key: string) => key) as ReturnType<
      typeof actual.useTranslation
    >[0];
    const response = [t, actual.getI18n(), true] as ReturnType<
      typeof actual.useTranslation
    >;

    response.t = t;
    response.i18n = actual.getI18n();
    response.ready = true;

    return response;
  };

  return {
    ...actual,
    useTranslation,
  };
});

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

import type { ToolbarGroupVisibility } from "@/types";
import { EditorToolbar } from "../EditorToolbar";

const TOOLS_ONLY_GROUPS: ToolbarGroupVisibility = {
  block: false,
  formatting: false,
  headings: false,
  history: false,
  insert: false,
  lists: false,
  tools: true,
};

function createEditorMock(
  markdown = "# Current note",
  options?: {
    can?: () => unknown;
    isDestroyed?: boolean;
  },
) {
  return {
    can:
      options?.can ??
      vi.fn(() => ({
        liftListItem: vi.fn(() => false),
        redo: vi.fn(() => false),
        sinkListItem: vi.fn(() => false),
        undo: vi.fn(() => false),
      })),
    getAttributes: vi.fn(() => ({})),
    getMarkdown: vi.fn(() => markdown),
    isActive: vi.fn(() => false),
    isDestroyed: options?.isDestroyed ?? false,
    off: vi.fn(),
    on: vi.fn(),
  };
}

const HISTORY_ONLY_GROUPS: ToolbarGroupVisibility = {
  block: false,
  formatting: false,
  headings: false,
  history: true,
  insert: false,
  lists: false,
  tools: false,
};

function setClipboard(writeText?: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: writeText ? { writeText: vi.fn(writeText) } : undefined,
  });

  return navigator.clipboard as Clipboard | undefined;
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("EditorToolbar", () => {
  let container: HTMLDivElement;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let root: ReactDOM.Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setClipboard(async () => undefined);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await flushMicrotasks();
    });

    container.remove();
    consoleErrorSpy.mockRestore();
  });

  it("Should copy the current editor content as markdown", async () => {
    const editor = createEditorMock("## Unsaved body");
    const clipboard = setClipboard(async () => undefined);

    await act(async () => {
      root.render(
        <EditorToolbar
          editor={editor as any}
          toolbarGroups={TOOLS_ONLY_GROUPS}
        />,
      );
    });

    const copyButtons = container.querySelectorAll<HTMLButtonElement>(
      'button[aria-label="editor.copyMarkdown"]',
    );

    await act(async () => {
      copyButtons[copyButtons.length - 1].click();
      await flushMicrotasks();
    });

    expect(editor.getMarkdown).toHaveBeenCalledTimes(1);
    expect(clipboard?.writeText).toHaveBeenCalledWith("## Unsaved body");
    expect(toastSuccessMock).toHaveBeenCalledWith("editor.copiedMarkdown");
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("Should show an error when markdown cannot be copied", async () => {
    const editor = createEditorMock("## Unsaved body");
    const clipboard = setClipboard(async () => {
      throw new Error("Clipboard denied");
    });

    await act(async () => {
      root.render(
        <EditorToolbar
          editor={editor as any}
          toolbarGroups={TOOLS_ONLY_GROUPS}
        />,
      );
    });

    const copyButtons = container.querySelectorAll<HTMLButtonElement>(
      'button[aria-label="editor.copyMarkdown"]',
    );

    await act(async () => {
      copyButtons[copyButtons.length - 1].click();
      await flushMicrotasks();
    });

    expect(clipboard?.writeText).toHaveBeenCalledWith("## Unsaved body");
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith("editor.copyFailed");
  });

  it("Should show an error when clipboard access is unavailable", async () => {
    const editor = createEditorMock("## Unsaved body");
    setClipboard();

    await act(async () => {
      root.render(
        <EditorToolbar
          editor={editor as any}
          toolbarGroups={TOOLS_ONLY_GROUPS}
        />,
      );
    });

    const copyButtons = container.querySelectorAll<HTMLButtonElement>(
      'button[aria-label="editor.copyMarkdown"]',
    );

    await act(async () => {
      copyButtons[copyButtons.length - 1].click();
      await flushMicrotasks();
    });

    expect(editor.getMarkdown).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith("editor.copyFailed");
  });

  it("Should render disabled history commands when editor.can throws", async () => {
    const editor = createEditorMock("# Current note", {
      can: vi.fn(() => {
        throw new TypeError("Cannot read properties of null (reading 'can')");
      }),
    });

    await act(async () => {
      root.render(
        <EditorToolbar
          editor={editor as any}
          toolbarGroups={HISTORY_ONLY_GROUPS}
        />,
      );
    });

    const undoButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="editor.undo"]',
    );
    const redoButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="editor.redo"]',
    );

    expect(undoButton).not.toBeNull();
    expect(redoButton).not.toBeNull();
    expect(undoButton?.disabled).toBe(true);
    expect(redoButton?.disabled).toBe(true);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
