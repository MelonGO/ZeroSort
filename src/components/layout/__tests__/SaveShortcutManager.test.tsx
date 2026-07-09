// @vitest-environment jsdom

/**
 * Tests for the Tauri-based save shortcut manager: focus-aware global
 * shortcut registration and save dispatch.
 */

import { act } from "react";
import ReactDOM from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SaveShortcutManager } from "../SaveShortcutManager";

const {
  getStateMock,
  invokeMock,
  isDesktopMock,
  isWindowFocusedMock,
  onIpcEventMock,
} = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  isDesktopMock: vi.fn(() => true),
  isWindowFocusedMock: vi.fn(),
  onIpcEventMock: vi.fn(),
  getStateMock: vi.fn(),
}));

vi.mock("@/lib/desktop-adapter", () => ({
  invoke: invokeMock,
  isDesktop: isDesktopMock,
  isWindowFocused: isWindowFocusedMock,
  onIpcEvent: onIpcEventMock,
}));

vi.mock("@/store/useStore", () => ({
  useStore: {
    getState: getStateMock,
  },
}));

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe("SaveShortcutManager", () => {
  let container: HTMLDivElement;
  let root: ReactDOM.Root;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let isUnmounted: boolean;

  const listeners = new Map<string, (payload: any) => void>();
  const unsubscribeMocks = new Map<string, ReturnType<typeof vi.fn>>();

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    container = document.createElement("div");
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);

    isUnmounted = false;
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    listeners.clear();
    unsubscribeMocks.clear();

    invokeMock.mockReset().mockResolvedValue(undefined);
    isDesktopMock.mockReset().mockReturnValue(true);
    isWindowFocusedMock.mockReset().mockResolvedValue(true);

    onIpcEventMock.mockReset().mockImplementation((channel, callback) => {
      listeners.set(channel, callback);
      const unsub = vi.fn();
      unsubscribeMocks.set(channel, unsub);
      return unsub;
    });

    getStateMock.mockReset().mockReturnValue({
      hasUnsavedChanges: true,
      saveCurrentNote: vi.fn().mockResolvedValue(true),
    });
  });

  afterEach(async () => {
    if (!isUnmounted && root) {
      await act(async () => {
        root.unmount();
        await flushPromises();
      });
    }

    container?.remove();
    consoleErrorSpy.mockRestore();
  });

  async function renderManager() {
    await act(async () => {
      root.render(<SaveShortcutManager />);
      await flushPromises();
    });
  }

  it("Should register CommandOrControl+S when the window starts focused", async () => {
    await renderManager();

    expect(invokeMock).toHaveBeenCalledWith(
      "shortcut:register",
      "CommandOrControl+S",
    );
  });

  it("Should register after the window becomes focused", async () => {
    isWindowFocusedMock.mockResolvedValue(false);

    await renderManager();

    expect(invokeMock).not.toHaveBeenCalledWith(
      "shortcut:register",
      "CommandOrControl+S",
    );

    await act(async () => {
      listeners.get("window:focus_changed")?.(true);
      await flushPromises();
    });

    expect(invokeMock).toHaveBeenCalledWith(
      "shortcut:register",
      "CommandOrControl+S",
    );
  });

  it("Should unregister when the window loses focus", async () => {
    await renderManager();

    await act(async () => {
      listeners.get("window:focus_changed")?.(false);
      await flushPromises();
    });

    expect(invokeMock).toHaveBeenCalledWith(
      "shortcut:unregister",
      "CommandOrControl+S",
    );
  });

  it("Should unregister and unsubscribe on cleanup", async () => {
    await renderManager();

    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    isUnmounted = true;

    expect(invokeMock).toHaveBeenCalledWith(
      "shortcut:unregister",
      "CommandOrControl+S",
    );
    expect(unsubscribeMocks.get("window:focus_changed")).toHaveBeenCalled();
    expect(unsubscribeMocks.get("shortcut:pressed")).toHaveBeenCalled();
  });

  it("Should call saveCurrentNote when the shortcut fires", async () => {
    const saveCurrentNote = vi.fn().mockResolvedValue(true);
    getStateMock.mockReturnValue({
      hasUnsavedChanges: true,
      saveCurrentNote,
    });

    await renderManager();

    await act(async () => {
      listeners.get("shortcut:pressed")?.({
        accelerator: "CommandOrControl+S",
      });
      await flushPromises();
    });

    expect(saveCurrentNote).toHaveBeenCalledTimes(1);
  });

  it("Should ignore shortcut events for other accelerators", async () => {
    const saveCurrentNote = vi.fn().mockResolvedValue(true);
    getStateMock.mockReturnValue({
      hasUnsavedChanges: true,
      saveCurrentNote,
    });

    await renderManager();

    await act(async () => {
      listeners.get("shortcut:pressed")?.({
        accelerator: "CommandOrControl+P",
      });
      await flushPromises();
    });

    expect(saveCurrentNote).not.toHaveBeenCalled();
  });

  it("Should do nothing when no save callback is available", async () => {
    getStateMock.mockReturnValue({
      hasUnsavedChanges: true,
      saveCurrentNote: null,
    });

    await renderManager();

    await act(async () => {
      listeners.get("shortcut:pressed")?.({
        accelerator: "CommandOrControl+S",
      });
      await flushPromises();
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("Should ignore repeated presses while a save is already in progress", async () => {
    const deferred = createDeferred<boolean>();
    const saveCurrentNote = vi.fn().mockReturnValue(deferred.promise);

    getStateMock.mockReturnValue({
      hasUnsavedChanges: true,
      saveCurrentNote,
    });

    await renderManager();

    const trigger = () =>
      listeners.get("shortcut:pressed")?.({
        accelerator: "CommandOrControl+S",
      });

    await act(async () => {
      trigger();
      trigger();
      await flushPromises();
    });

    expect(saveCurrentNote).toHaveBeenCalledTimes(1);

    deferred.resolve(true);

    await act(async () => {
      await flushPromises();
      trigger();
      await flushPromises();
    });

    expect(saveCurrentNote).toHaveBeenCalledTimes(2);
  });

  it("Should handle registration failure without throwing", async () => {
    const registrationError = new Error("Shortcut unavailable");
    invokeMock.mockImplementation(async (channel: string) => {
      if (channel === "shortcut:register") {
        throw registrationError;
      }
      return undefined;
    });

    await renderManager();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to register save shortcut:",
      registrationError,
    );
  });

  it("Should save from the focused keydown fallback", async () => {
    const saveCurrentNote = vi.fn().mockResolvedValue(true);
    getStateMock.mockReturnValue({
      hasUnsavedChanges: true,
      saveCurrentNote,
    });

    await renderManager();

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: "s",
    });

    window.dispatchEvent(event);
    await flushPromises();

    expect(event.defaultPrevented).toBe(true);
    expect(saveCurrentNote).toHaveBeenCalledTimes(1);
  });
});
