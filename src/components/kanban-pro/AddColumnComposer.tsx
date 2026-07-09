import { Check, X } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { columnColors } from "@/lib/kanban/kanban-board.shared";

export function AddColumnComposer({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (column: {
    title: string;
    description: string;
    color: string;
  }) => void;
}) {
  const { t } = useTranslation(undefined, { keyPrefix: "kanban" });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(columnColors[0]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      return;
    }

    onSubmit({ title: trimmedTitle, description: description.trim(), color });
  };

  return (
    <form
      className="kanban-add-column kanban-add-column--form"
      onSubmit={handleSubmit}
    >
      <input
        autoFocus
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onCancel();
          }
        }}
        aria-label={t("forms.columnName")}
        placeholder={t("forms.columnName")}
        value={title}
      />
      <input
        onChange={(event) => setDescription(event.target.value)}
        aria-label={t("forms.description")}
        placeholder={t("forms.description")}
        value={description}
      />
      <div
        className="kanban-color-swatches"
        aria-label={t("forms.columnColor")}
      >
        {columnColors.map((swatch) => (
          <button
            aria-label={t("forms.useColor", { color: swatch })}
            aria-pressed={color === swatch}
            key={swatch}
            onClick={() => setColor(swatch)}
            style={{ backgroundColor: swatch }}
            type="button"
          />
        ))}
      </div>
      <div className="kanban-composer__actions">
        <button className="kanban-action-button" type="submit">
          <Check size={15} />
          {t("actions.addColumn")}
        </button>
        <button
          className="kanban-icon-button"
          onClick={onCancel}
          type="button"
          aria-label={t("actions.cancel")}
        >
          <X size={15} />
        </button>
      </div>
    </form>
  );
}
