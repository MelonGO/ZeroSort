import { Editor } from "@tiptap/react";
import { useCallback, useRef, useSyncExternalStore } from "react";

/**
 * Hook to track editor selection state using useSyncExternalStore.
 * Replaces useEffect-based subscription pattern for better React 18 concurrent mode support.
 * Note: hasFocus is excluded as it changes too frequently during menu interactions.
 */
export function useEditorSelection(editor: Editor) {
  const subscribe = useCallback(
    (callback: () => void) => {
      editor.on("selectionUpdate", callback);
      return () => {
        editor.off("selectionUpdate", callback);
      };
    },
    [editor],
  );

  // Cache the last snapshot to return stable reference for equal values
  const lastSnapshotRef = useRef({
    from: editor.state.selection.from,
    to: editor.state.selection.to,
    empty: editor.state.selection.empty,
  });

  const getSnapshot = useCallback(() => {
    const { from, to, empty } = editor.state.selection;
    const last = lastSnapshotRef.current;

    // Return cached reference if values haven't changed
    if (last.from === from && last.to === to && last.empty === empty) {
      return last;
    }

    const newSnapshot = { from, to, empty };
    lastSnapshotRef.current = newSnapshot;
    return newSnapshot;
  }, [editor]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
