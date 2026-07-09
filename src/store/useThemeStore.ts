import { defaultThemeState } from "@/lib/theme/config";
import { getPresetThemeStyles } from "@/lib/theme/preset-helper";
import type { ThemeEditorState } from "@/types/theme";
import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_HISTORY_COUNT = 30;
const HISTORY_OVERRIDE_THRESHOLD_MS = 500;

function isDeepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

interface ThemeHistoryEntry {
  state: ThemeEditorState;
  timestamp: number;
}

interface ThemeStore {
  themeState: ThemeEditorState;
  themeCheckpoint: ThemeEditorState | null;
  history: ThemeHistoryEntry[];
  future: ThemeHistoryEntry[];
  setThemeState: (state: ThemeEditorState) => void;
  applyThemePreset: (preset: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

/**
 * Separate Zustand store for theme state, persisted to localStorage.
 * Uses localStorage (synchronous) to prevent theme flash on startup.
 */
export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      themeState: defaultThemeState,
      themeCheckpoint: null,
      history: [],
      future: [],

      setThemeState: (newState: ThemeEditorState) => {
        const oldThemeState = get().themeState;
        let currentHistory = get().history;
        let currentFuture = get().future;

        // If only currentMode changed, skip history tracking
        const oldWithoutMode = { ...oldThemeState, currentMode: undefined };
        const newWithoutMode = { ...newState, currentMode: undefined };

        if (
          isDeepEqual(oldWithoutMode, newWithoutMode) &&
          oldThemeState.currentMode !== newState.currentMode
        ) {
          set({ themeState: newState });
          return;
        }

        const currentTime = Date.now();
        const lastHistoryEntry =
          currentHistory.length > 0
            ? currentHistory[currentHistory.length - 1]
            : null;

        if (
          !lastHistoryEntry ||
          currentTime - lastHistoryEntry.timestamp >=
            HISTORY_OVERRIDE_THRESHOLD_MS
        ) {
          currentHistory = [
            ...currentHistory,
            { state: oldThemeState, timestamp: currentTime },
          ];
          currentFuture = [];
        }

        if (currentHistory.length > MAX_HISTORY_COUNT) {
          currentHistory.shift();
        }

        set({
          themeState: newState,
          history: currentHistory,
          future: currentFuture,
        });
      },

      applyThemePreset: (preset: string) => {
        const currentThemeState = get().themeState;
        const oldHistory = get().history;
        const currentTime = Date.now();

        const newStyles = getPresetThemeStyles(preset);
        const newThemeState: ThemeEditorState = {
          ...currentThemeState,
          preset,
          styles: newStyles,
          hslAdjustments: defaultThemeState.hslAdjustments,
        };

        const newHistoryEntry = {
          state: currentThemeState,
          timestamp: currentTime,
        };
        let updatedHistory = [...oldHistory, newHistoryEntry];
        if (updatedHistory.length > MAX_HISTORY_COUNT) {
          updatedHistory.shift();
        }

        set({
          themeState: newThemeState,
          themeCheckpoint: newThemeState,
          history: updatedHistory,
          future: [],
        });
      },

      undo: () => {
        const history = get().history;
        if (history.length === 0) return;

        const currentThemeState = get().themeState;
        const future = get().future;

        const lastHistoryEntry = history[history.length - 1];
        const newHistory = history.slice(0, -1);

        const newFutureEntry = {
          state: currentThemeState,
          timestamp: Date.now(),
        };
        const newFuture = [newFutureEntry, ...future];

        set({
          themeState: {
            ...lastHistoryEntry.state,
            currentMode: currentThemeState.currentMode,
          },
          themeCheckpoint: lastHistoryEntry.state,
          history: newHistory,
          future: newFuture,
        });
      },

      redo: () => {
        const future = get().future;
        if (future.length === 0) return;

        const currentThemeState = get().themeState;
        const history = get().history;

        const nextFutureEntry = future[0];
        const newFuture = future.slice(1);

        const newHistoryEntry = {
          state: currentThemeState,
          timestamp: Date.now(),
        };
        const newHistory = [...history, newHistoryEntry];

        set({
          themeState: {
            ...nextFutureEntry.state,
            currentMode: currentThemeState.currentMode,
          },
          history: newHistory,
          future: newFuture,
        });
      },

      canUndo: () => get().history.length > 0,
      canRedo: () => get().future.length > 0,
    }),
    {
      name: "zerosort-theme-storage",
      partialize: (state) => ({
        themeState: state.themeState,
        themeCheckpoint: state.themeCheckpoint,
      }),
    },
  ),
);
