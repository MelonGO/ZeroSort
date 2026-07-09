import { useTranslation } from "react-i18next";

interface UnsavedChangesDialogProps {
  /** Whether the dialog is visible */
  isOpen: boolean;
  /** Whether a save operation is in progress */
  isSaving: boolean;
  /** Called when the user chooses to save and continue */
  onSave: () => void | Promise<boolean>;
  /** Called when the user chooses to discard changes */
  onDiscard: () => void | Promise<void>;
  /** Called when the user cancels (closes the dialog without action) */
  onCancel: () => void;
}

/** Reusable confirmation dialog shown when there are unsaved changes. */
export function UnsavedChangesDialog({
  isOpen,
  isSaving,
  onSave,
  onDiscard,
  onCancel,
}: UnsavedChangesDialogProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-100 flex animate-in items-center justify-center bg-black/40 p-4 backdrop-blur-[2px] duration-200 fade-in">
      <div className="w-full max-w-100 animate-in rounded-2xl bg-background p-6 shadow-2xl duration-200 zoom-in-95">
        <h3 className="mb-2 text-xl font-bold">{t("note.unsavedChanges")}</h3>
        <p className="mb-6 text-muted-foreground">
          {t("note.unsavedChangesDescription")}
        </p>
        <div className="flex flex-col space-y-2">
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="flex w-full items-center justify-center rounded-xl bg-accent px-4 py-3 font-semibold transition-all duration-200 hover:brightness-95 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSaving ? t("common.saving") : t("note.saveAndContinue")}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="w-full rounded-xl bg-muted px-4 py-3 font-semibold transition-all duration-200 hover:bg-muted/80 hover:shadow-sm"
          >
            {t("note.discardChanges")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-xl px-4 py-3 transition-colors duration-200 hover:bg-muted/60"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
