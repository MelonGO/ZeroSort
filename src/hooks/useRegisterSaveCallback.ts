import { useStore } from "@/store/useStore";
import { useCallback, useEffect, useRef } from "react";

/**
 * Registers a stable save callback in the global store for external callers (e.g. route blocker).
 */
export function useRegisterSaveCallback(handleSave: () => Promise<boolean>) {
  const setSaveCurrentNote = useStore((state) => state.setSaveCurrentNote);
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  const stableSave = useCallback(async () => {
    return await handleSaveRef.current();
  }, []);

  useEffect(() => {
    setSaveCurrentNote(stableSave);
    return () => {
      setSaveCurrentNote(null);
    };
  }, [stableSave, setSaveCurrentNote]);
}
