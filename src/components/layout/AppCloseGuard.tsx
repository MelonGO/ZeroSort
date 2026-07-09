import { UnsavedChangesDialog } from "@/components/editor/UnsavedChangesDialog";
import { invoke, isDesktop, onIpcEvent } from "@/lib/desktop-adapter";
import { discardPendingManagedImageFiles } from "@/lib/images";
import { useStore } from "@/store/useStore";
import { useCallback, useEffect, useState } from "react";

interface CloseRequestedPayload {
  requestId: number;
}

async function confirmAppClose(requestId: number): Promise<void> {
  await invoke("app:confirm_close", { requestId });
}

/** Shows the unsaved-changes dialog when desktop app close is blocked. */
export function AppCloseGuard() {
  const [pendingCloseRequest, setPendingCloseRequest] =
    useState<CloseRequestedPayload | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isDesktop()) {
      return;
    }

    return onIpcEvent<CloseRequestedPayload>(
      "app:close_requested",
      (payload) => {
        const { hasUnsavedChanges } = useStore.getState();
        if (!hasUnsavedChanges) {
          void confirmAppClose(payload.requestId);
          return;
        }

        setPendingCloseRequest(payload);
      },
    );
  }, []);

  const handleSaveAndClose = useCallback(async () => {
    if (!pendingCloseRequest) {
      return false;
    }

    const { saveCurrentNote } = useStore.getState();
    if (!saveCurrentNote) {
      return false;
    }

    setIsSaving(true);
    try {
      const didSave = await saveCurrentNote();
      if (didSave) {
        await confirmAppClose(pendingCloseRequest.requestId);
      }
      return didSave;
    } catch (error) {
      console.error("Failed to save note before app close:", error);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [pendingCloseRequest]);

  const handleDiscardAndClose = useCallback(async () => {
    if (!pendingCloseRequest) {
      return;
    }

    const { selectedNoteId, setHasUnsavedChanges } = useStore.getState();
    if (selectedNoteId) {
      try {
        await discardPendingManagedImageFiles(selectedNoteId);
      } catch (error) {
        console.error("Failed to discard pending managed images:", error);
      }
    }

    setHasUnsavedChanges(false);
    await confirmAppClose(pendingCloseRequest.requestId);
  }, [pendingCloseRequest]);

  const handleCancelClose = useCallback(() => {
    setPendingCloseRequest(null);
  }, []);

  return (
    <UnsavedChangesDialog
      isOpen={pendingCloseRequest !== null}
      isSaving={isSaving}
      onSave={handleSaveAndClose}
      onDiscard={handleDiscardAndClose}
      onCancel={handleCancelClose}
    />
  );
}
