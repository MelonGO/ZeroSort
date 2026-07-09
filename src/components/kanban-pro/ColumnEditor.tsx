import { Check, Trash2, X } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  columnColors,
  type ColumnUpdates,
} from "@/lib/kanban/kanban-board.shared";
import { getColumnContent } from "@/lib/kanban/kanban-board.utils";
import type { BoardItem } from "@/lib/kanban/types";

export function ColumnEditor({
  data,
  onCancel,
  onDelete,
  onSubmit,
}: {
  data: BoardItem;
  onCancel: () => void;
  onDelete: () => void;
  onSubmit: (updates: ColumnUpdates) => void;
}) {
  const { t } = useTranslation(undefined, { keyPrefix: "kanban" });
  const content = getColumnContent(data) ?? {
    color: columnColors[0],
    description: "",
  };
  const [title, setTitle] = useState(data.title);
  const [description, setDescription] = useState(content.description);
  const [color, setColor] = useState(content.color);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      return;
    }

    onSubmit({
      title: trimmedTitle,
      content: {
        color,
        description: description.trim() || t("defaults.newWorkflowStage"),
      },
    });
  };

  return (
    <form
      className="kanban-column-editor"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onCancel();
        }
      }}
      onSubmit={handleSubmit}
    >
      <input
        aria-label={t("forms.columnTitle")}
        autoFocus
        onChange={(event) => setTitle(event.target.value)}
        value={title}
      />
      <textarea
        aria-label={t("forms.columnDescription")}
        onChange={(event) => setDescription(event.target.value)}
        rows={2}
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
      <div className="kanban-composer__actions kanban-composer__actions--spread">
        <button className="kanban-action-button" type="submit">
          <Check size={15} />
          {t("actions.save")}
        </button>
        <div className="kanban-inline-actions">
          <button
            aria-label={t("actions.deleteColumn", { title: data.title })}
            className="kanban-icon-button kanban-icon-button--danger"
            onClick={onDelete}
            type="button"
          >
            <Trash2 size={15} />
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
      </div>
    </form>
  );
}
