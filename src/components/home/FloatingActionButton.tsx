import { cn } from "@/lib/utils";
import { Edit } from "lucide-react";
import { useTranslation } from "react-i18next";

interface FloatingActionButtonProps {
  onClick: () => void;
  /** Controls positioning: "desktop" uses right-20 bottom-8, "mobile" uses right-4 bottom-4 */
  variant?: "desktop" | "mobile";
}

/**
 * Floating action button for creating new notes.
 * Positioned in the bottom-right corner of the screen.
 */
export function FloatingActionButton({
  onClick,
  variant = "desktop",
}: FloatingActionButtonProps) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "absolute z-30",
        variant === "desktop" ? "right-20 bottom-8" : "right-4 bottom-4",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex cursor-pointer items-center space-x-2 rounded-xl bg-primary p-3 text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
        title={t("note.createNote", "Create")}
      >
        <Edit size={24} />
        <span className="font-semibold">{t("note.createNote", "Create")}</span>
      </button>
    </div>
  );
}
