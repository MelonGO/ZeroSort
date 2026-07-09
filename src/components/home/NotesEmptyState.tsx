import { useTranslation } from "react-i18next";

/**
 * Empty state view displayed when there are no notes.
 */
export function NotesEmptyState() {
  const { t } = useTranslation();

  return (
    <div className="py-20 text-center text-muted-foreground">
      {t("home.noNotes")}
    </div>
  );
}
