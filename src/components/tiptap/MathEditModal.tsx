import { Editor } from "@tiptap/react";
import { X } from "lucide-react";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

interface MathEditModalProps {
  editor: Editor;
  initialLatex: string;
  mathType: "inline" | "block";
  pos: number;
  onClose: () => void;
}

/** Modal for editing inline or block math (LaTeX) nodes. */
export function MathEditModal({
  editor,
  initialLatex,
  mathType,
  pos,
  onClose,
}: MathEditModalProps) {
  const { t } = useTranslation();
  const [latex, setLatex] = useState(initialLatex);

  const handleSubmit = useCallback(() => {
    if (!latex.trim()) {
      // If empty, delete the math node
      if (mathType === "inline") {
        editor.chain().focus().deleteInlineMath({ pos }).run();
      } else {
        editor.chain().focus().deleteBlockMath({ pos }).run();
      }
    } else {
      // Update the math node
      if (mathType === "inline") {
        editor
          .chain()
          .focus()
          .setNodeSelection(pos)
          .updateInlineMath({ latex })
          .run();
      } else {
        editor
          .chain()
          .focus()
          .setNodeSelection(pos)
          .updateBlockMath({ latex })
          .run();
      }
    }

    onClose();
  }, [editor, latex, mathType, pos, onClose]);

  return createPortal(
    <div className="fixed inset-0 z-60 flex animate-in items-center justify-center bg-black/50 p-4 backdrop-blur-sm duration-200 fade-in">
      <div
        className="flex w-full max-w-md animate-in flex-col overflow-hidden rounded-2xl bg-card shadow-2xl duration-200 zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
          <h3 className="text-lg font-semibold text-foreground">
            {mathType === "inline"
              ? t("editor.inlineMath")
              : t("editor.blockMath")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex flex-col gap-4 p-4">
          <label
            htmlFor="math-edit-input"
            className="text-sm text-muted-foreground"
          >
            {t("editor.enterLatex")}
          </label>
          <input
            id="math-edit-input"
            type="text"
            placeholder="E = mc^2"
            value={latex}
            onChange={(e) => setLatex(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSubmit();
              }
            }}
            className="w-full rounded-xl border-none bg-muted px-4 py-3 font-mono text-sm transition-all outline-none focus:ring-2 focus:ring-accent"
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("common.save")}
          </button>
        </div>
      </div>
      <div className="absolute inset-0 -z-10" onClick={onClose} />
    </div>,
    document.body,
  );
}
