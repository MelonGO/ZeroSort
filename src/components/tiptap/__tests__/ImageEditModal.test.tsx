// @vitest-environment jsdom

/**
 * Tests for image modal file insertion flows.
 */

import { act } from "react";
import ReactDOM from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { openMock, saveManagedImagePathMock, statMock, toastErrorMock } =
  vi.hoisted(() => ({
    openMock: vi.fn(),
    saveManagedImagePathMock: vi.fn(),
    statMock: vi.fn(),
    toastErrorMock: vi.fn(),
  }));

vi.mock("@/lib/dialog", () => ({
  open: openMock,
}));

vi.mock("@/lib/fs", () => ({
  stat: statMock,
}));

vi.mock("@/lib/images", () => ({
  saveManagedImageFile: vi.fn(),
  saveManagedImagePath: saveManagedImagePathMock,
}));

vi.mock("@/lib/utils", () => ({
  cn: (...values: Array<string | false | null | undefined>) =>
    values.filter(Boolean).join(" "),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
  },
}));

import { ImageEditModal } from "../ImageEditModal";

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function createEditorMock() {
  const runMock = vi.fn(() => true);
  const setImageMock = vi.fn(() => ({ run: runMock }));
  const focusMock = vi.fn(() => ({ setImage: setImageMock }));
  const chainMock = vi.fn(() => ({ focus: focusMock }));

  return {
    chain: chainMock,
    state: {
      doc: {
        nodeAt: vi.fn(() => null),
      },
      selection: {
        from: 1,
      },
    },
    view: {
      dispatch: vi.fn(),
    },
    __mocks: {
      chainMock,
      focusMock,
      runMock,
      setImageMock,
    },
  };
}

describe("ImageEditModal", () => {
  let container: HTMLDivElement;
  let root: ReactDOM.Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    vi.clearAllMocks();
    openMock.mockResolvedValue("/tmp/photo.png");
    statMock.mockResolvedValue({
      isFile: true,
      size: 1024,
    });
    saveManagedImagePathMock.mockResolvedValue({
      relativePath: "images/note-1/photo.png",
    });

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
    document.body.innerHTML = "";
  });

  it("Should save and insert an image chosen from the file picker", async () => {
    const editor = createEditorMock();
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        <ImageEditModal
          editor={editor as any}
          noteId="note-1"
          initial={{
            src: "",
            sourceMode: "file",
            filePath: "",
            alt: "",
            display: "block",
            pos: null,
          }}
          onClose={onClose}
        />,
      );
    });

    const buttons = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    );
    const chooseButton = buttons.find(
      (button) => button.textContent === "editor.imageChooseFile",
    );
    const saveButton = buttons.find(
      (button) => button.textContent === "common.save",
    );

    expect(chooseButton).toBeTruthy();
    expect(saveButton).toBeTruthy();

    await act(async () => {
      chooseButton?.click();
      await flushMicrotasks();
    });

    await act(async () => {
      saveButton?.click();
      await flushMicrotasks();
    });

    expect(openMock).toHaveBeenCalledTimes(1);
    expect(statMock).toHaveBeenCalledWith("/tmp/photo.png");
    expect(saveManagedImagePathMock).toHaveBeenCalledWith(
      "note-1",
      "/tmp/photo.png",
    );
    expect(editor.__mocks.setImageMock).toHaveBeenCalledWith({
      src: "images/note-1/photo.png",
      alt: undefined,
    });
    expect(editor.__mocks.runMock).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});
