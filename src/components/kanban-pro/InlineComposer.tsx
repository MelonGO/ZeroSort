import { Check, X } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function InlineComposer({
  placeholder,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  placeholder: string;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (title: string) => void;
}) {
  const { t } = useTranslation(undefined, { keyPrefix: "kanban" });
  const [title, setTitle] = useState("");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      return;
    }

    onSubmit(trimmedTitle);
  };

  return (
    <form className="kanban-composer" onSubmit={handleSubmit}>
      <input
        autoFocus
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onCancel();
          }
        }}
        placeholder={placeholder}
        value={title}
      />
      <div className="kanban-composer__actions">
        <button
          aria-label={submitLabel}
          className="kanban-icon-button"
          type="submit"
        >
          <Check size={15} />
        </button>
        <button
          aria-label={t("actions.cancel")}
          className="kanban-icon-button"
          onClick={onCancel}
          type="button"
        >
          <X size={15} />
        </button>
      </div>
    </form>
  );
}
