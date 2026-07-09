import { useEffect, useRef } from "react";

import {
  invoke,
  isDesktop,
  isWindowFocused,
  onIpcEvent,
} from "@/lib/desktop-adapter";
import { useStore } from "@/store/useStore";

const SAVE_SHORTCUT = "CommandOrControl+S";

interface ShortcutPressedPayload {
  accelerator: string;
}

/**
 * Registers the desktop save shortcut while the main window is focused.
 *
 * Uses the host global-shortcut API via IPC/commands and listens to focus
 * changes so the accelerator is only active when the window has focus.
 */
export function SaveShortcutManager() {
  const isRegisteredRef = useRef(false);
  const isSaveInProgressRef = useRef(false);

  useEffect(() => {
    let isActive = true;
    let unsubscribeFocus: (() => void) | null = null;
    let unsubscribePressed: (() => void) | null = null;

    const triggerSave = async () => {
      if (isSaveInProgressRef.current) {
        return;
      }

      const { hasUnsavedChanges, saveCurrentNote } = useStore.getState();
      if (!hasUnsavedChanges || !saveCurrentNote) {
        return;
      }

      isSaveInProgressRef.current = true;
      try {
        await saveCurrentNote();
      } catch (error) {
        console.error("Failed to save note from shortcut:", error);
      } finally {
        isSaveInProgressRef.current = false;
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const isSaveKey = event.key.toLowerCase() === "s";
      const hasModifier = event.metaKey || event.ctrlKey;

      if (!isSaveKey || !hasModifier || event.altKey) {
        return;
      }

      event.preventDefault();
      void triggerSave();
    };

    const registerShortcut = async () => {
      if (!isActive || isRegisteredRef.current) {
        return;
      }

      try {
        await invoke("shortcut:register", SAVE_SHORTCUT);
        if (isActive) {
          isRegisteredRef.current = true;
        }
      } catch (error) {
        console.error("Failed to register save shortcut:", error);
      }
    };

    const unregisterShortcut = async () => {
      if (!isRegisteredRef.current) {
        return;
      }

      try {
        await invoke("shortcut:unregister", SAVE_SHORTCUT);
      } catch (error) {
        console.error("Failed to unregister save shortcut:", error);
      } finally {
        isRegisteredRef.current = false;
        isSaveInProgressRef.current = false;
      }
    };

    const initializeShortcut = async () => {
      if (!isDesktop()) {
        return;
      }

      try {
        const focused = await isWindowFocused();

        if (!isActive) return;

        if (focused) {
          await registerShortcut();
        }

        unsubscribePressed = onIpcEvent<ShortcutPressedPayload>(
          "shortcut:pressed",
          (payload) => {
            if (payload.accelerator !== SAVE_SHORTCUT) return;
            void triggerSave();
          },
        );

        unsubscribeFocus = onIpcEvent<boolean>(
          "window:focus_changed",
          (isFocused) => {
            if (isFocused) {
              void registerShortcut();
            } else {
              void unregisterShortcut();
            }
          },
        );
      } catch (error) {
        console.error("Failed to initialize save shortcut manager:", error);
      }
    };

    void initializeShortcut();
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      isActive = false;
      window.removeEventListener("keydown", handleKeyDown);
      unsubscribeFocus?.();
      unsubscribePressed?.();
      void unregisterShortcut();
    };
  }, []);

  return null;
}
