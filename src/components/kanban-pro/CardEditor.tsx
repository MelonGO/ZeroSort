import { CalendarDays, Check, Trash2, X } from "lucide-react";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  priorityLabelKeys,
  priorityOptions,
  type CardUpdates,
} from "@/lib/kanban/kanban-board.shared";
import {
  createDefaultCardContent,
  getCardContent,
} from "@/lib/kanban/kanban-board.utils";
import type { BoardItem, Priority } from "@/lib/kanban/types";

function formatDueDate(date: Date, language: string) {
  return new Intl.DateTimeFormat(language, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function parseDueDate(value: string) {
  if (!value.trim() || value === "TBD") {
    return undefined;
  }

  const parsedDate = new Date(`${value} ${new Date().getFullYear()}`);

  if (Number.isNaN(parsedDate.getTime())) {
    return undefined;
  }

  return parsedDate;
}

export function CardEditor({
  data,
  onCancel,
  onDelete,
  onSubmit,
}: {
  data: BoardItem;
  onCancel: () => void;
  onDelete: () => void;
  onSubmit: (updates: CardUpdates) => void;
}) {
  const { i18n, t } = useTranslation(undefined, { keyPrefix: "kanban" });
  const content = getCardContent(data) ?? createDefaultCardContent(data.title);
  const [title, setTitle] = useState(data.title);
  const [description, setDescription] = useState(content.description);
  const [priority, setPriority] = useState<Priority>(content.priority);
  const [assignee, setAssignee] = useState(content.assignee);
  const [dueDate, setDueDate] = useState(content.dueDate);
  const [tags, setTags] = useState(content.tags.join(", "));
  const [isDueDateOpen, setIsDueDateOpen] = useState(false);
  const selectedDueDate = parseDueDate(dueDate);
  const currentLanguage = i18n.resolvedLanguage ?? i18n.language;
  const formattedSelectedDueDate = useMemo(
    () =>
      selectedDueDate
        ? formatDueDate(selectedDueDate, currentLanguage)
        : undefined,
    [currentLanguage, selectedDueDate],
  );

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      return;
    }

    onSubmit({
      title: trimmedTitle,
      content: {
        description: description.trim(),
        priority,
        assignee: assignee.trim() || t("defaults.unassigned"),
        dueDate: dueDate.trim() || "TBD",
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      },
    });
  };

  return (
    <form
      className="kanban-card-editor"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onCancel();
        }
      }}
      onSubmit={handleSubmit}
    >
      <input
        aria-label={t("forms.cardTitle")}
        autoFocus
        onChange={(event) => setTitle(event.target.value)}
        value={title}
      />
      <textarea
        aria-label={t("forms.cardDescription")}
        onChange={(event) => setDescription(event.target.value)}
        rows={3}
        value={description}
      />
      <div className="kanban-card-editor__grid">
        <label>
          {t("forms.priority")}
          <select
            onChange={(event) => setPriority(event.target.value as Priority)}
            value={priority}
          >
            {priorityOptions.map((option) => (
              <option key={option} value={option}>
                {t(priorityLabelKeys[option])}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("forms.dueDate")}
          <span className="kanban-date-picker">
            <span className="kanban-date-picker__summary">
              <Popover open={isDueDateOpen} onOpenChange={setIsDueDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    className="kanban-date-picker__trigger"
                    type="button"
                    variant="outline"
                  >
                    <CalendarDays size={14} />
                    <span>
                      {formattedSelectedDueDate ?? t("forms.noDueDate")}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="kanban-date-picker__popover"
                >
                  <Calendar
                    mode="single"
                    selected={selectedDueDate}
                    defaultMonth={selectedDueDate}
                    onSelect={(date) => {
                      setDueDate(
                        date ? formatDueDate(date, currentLanguage) : "TBD",
                      );
                      setIsDueDateOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
              {selectedDueDate ? (
                <button
                  className="kanban-date-picker__clear"
                  onClick={() => setDueDate("TBD")}
                  type="button"
                >
                  {t("actions.clear")}
                </button>
              ) : null}
            </span>
          </span>
        </label>
      </div>
      <label>
        {t("forms.assignee")}
        <input
          onChange={(event) => setAssignee(event.target.value)}
          value={assignee}
        />
      </label>
      <label>
        {t("forms.tags")}
        <input onChange={(event) => setTags(event.target.value)} value={tags} />
      </label>
      <div className="kanban-composer__actions kanban-composer__actions--spread">
        <button className="kanban-action-button" type="submit">
          <Check size={15} />
          {t("actions.save")}
        </button>
        <div className="kanban-inline-actions">
          <button
            aria-label={t("actions.deleteCard", { title: data.title })}
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
