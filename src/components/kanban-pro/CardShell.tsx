import { memo } from "react";

import type {
  CardDropTarget,
  CardUpdates,
} from "@/lib/kanban/kanban-board.shared";
import { getCardEdge } from "@/lib/kanban/kanban-board.utils";
import type { BoardItem } from "@/lib/kanban/types";
import { CardEditor } from "./CardEditor";
import { TaskCard } from "./TaskCard";

export const CardShell = memo(function CardShell({
  aiChangeKind,
  aiChangeToken,
  card,
  column,
  dropEdge,
  isEditing,
  onCancelEdit,
  onDelete,
  onDragEnd,
  onDragOver,
  onDrop,
  onEdit,
  onSubmit,
  onDragStart,
}: {
  aiChangeKind?: "created" | "updated" | "moved";
  aiChangeToken?: number;
  card: BoardItem;
  column: BoardItem;
  dropEdge?: CardDropTarget["edge"];
  isEditing: boolean;
  onCancelEdit: () => void;
  onDelete: (card: BoardItem) => void;
  onDragEnd: () => void;
  onDragOver: (target: CardDropTarget) => void;
  onDrop: (target: CardDropTarget) => void;
  onEdit: (cardId: string) => void;
  onSubmit: (cardId: string, updates: CardUpdates) => void;
  onDragStart: (cardId: string, columnId: string) => void;
}) {
  return (
    <div
      className="kanban-card-shell"
      data-ai-change-active={Boolean(aiChangeKind) || undefined}
      data-ai-change-kind={aiChangeKind}
      data-ai-change-token={aiChangeKind ? aiChangeToken : undefined}
      data-drop-edge={dropEdge}
      draggable={!isEditing}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", card.id);
        onDragStart(card.id, column.id);
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();

        onDragOver({
          columnId: column.id,
          cardId: card.id,
          edge: getCardEdge(event),
        });
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();

        onDrop({
          columnId: column.id,
          cardId: card.id,
          edge: getCardEdge(event),
        });
      }}
    >
      {isEditing ? (
        <CardEditor
          data={card}
          onCancel={onCancelEdit}
          onDelete={() => onDelete(card)}
          onSubmit={(updates) => onSubmit(card.id, updates)}
        />
      ) : (
        <TaskCard
          data={card}
          onDelete={() => onDelete(card)}
          onEdit={() => onEdit(card.id)}
        />
      )}
    </div>
  );
});
