import { CalendarDays, GripVertical, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";

import { priorityLabelKeys } from "@/lib/kanban/kanban-board.shared";
import { getCardContent } from "@/lib/kanban/kanban-board.utils";
import type { BoardItem } from "@/lib/kanban/types";

export function TaskCard({
  data,
  onEdit,
}: {
  data: BoardItem;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation(undefined, { keyPrefix: "kanban" });
  const content = getCardContent(data);
  const priority = content?.priority ?? "medium";

  return (
    <article className="kanban-card">
      <div className="kanban-card__handle" aria-hidden="true">
        <GripVertical size={15} />
      </div>
      <button
        aria-label={t("actions.editCard", { title: data.title })}
        className="kanban-card__body"
        onClick={onEdit}
        type="button"
      >
        <div className="kanban-card__topline">
          <h3>{data.title}</h3>
          <div className="kanban-card__actions">
            <span className={`kanban-priority kanban-priority--${priority}`}>
              {t(priorityLabelKeys[priority])}
            </span>
          </div>
        </div>
        <p>{content?.description}</p>
        <div className="kanban-card__tags">
          {content?.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <div className="kanban-card__meta">
          <span>
            <UserRound size={14} />
            {content?.assignee}
          </span>
          <span>
            <CalendarDays size={14} />
            {content?.dueDate}
          </span>
        </div>
      </button>
    </article>
  );
}
