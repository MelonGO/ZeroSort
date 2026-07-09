import { GripVertical, Plus } from "lucide-react";
import { memo } from "react";
import { useTranslation } from "react-i18next";

import type {
  CardDropTarget,
  CardUpdates,
  ColumnDropTarget,
  ColumnUpdates,
} from "@/lib/kanban/kanban-board.shared";
import {
  getColumnContent,
  getColumnEdge,
} from "@/lib/kanban/kanban-board.utils";
import type { BoardItem } from "@/lib/kanban/types";
import { CardShell } from "./CardShell";
import { ColumnEditor } from "./ColumnEditor";
import { InlineComposer } from "./InlineComposer";

export const BoardColumn = memo(function BoardColumn({
  aiChangeKind,
  aiChangeToken,
  aiChangedCardIds,
  cards,
  cardAIChangeKind,
  cardDropTarget,
  column,
  columnDropEdge,
  editingCardId,
  isAddingCard,
  isColumnDragging,
  isEditingColumn,
  onAddCard,
  onCancelCardComposer,
  onCancelCardEdit,
  onCancelColumnEdit,
  onCardDragOver,
  onCardDrop,
  onClearDragState,
  onColumnDragOver,
  onColumnDrop,
  onDeleteCard,
  onDeleteColumn,
  onEditCard,
  onEditColumn,
  onStartCardComposer,
  onStartCardDrag,
  onStartColumnDrag,
  onSubmitCard,
  onSubmitColumn,
}: {
  aiChangeKind?: "created" | "updated" | "moved";
  aiChangeToken?: number;
  aiChangedCardIds: string[];
  cards: BoardItem[];
  cardAIChangeKind?: "created" | "updated" | "moved";
  cardDropTarget: CardDropTarget | null;
  column: BoardItem;
  columnDropEdge?: ColumnDropTarget["edge"];
  editingCardId: string | null;
  isAddingCard: boolean;
  isColumnDragging: boolean;
  isEditingColumn: boolean;
  onAddCard: (columnId: string, title: string) => void;
  onCancelCardComposer: () => void;
  onCancelCardEdit: () => void;
  onCancelColumnEdit: () => void;
  onCardDragOver: (target: CardDropTarget) => void;
  onCardDrop: (target: CardDropTarget) => void;
  onClearDragState: () => void;
  onColumnDragOver: (target: ColumnDropTarget) => void;
  onColumnDrop: (target: ColumnDropTarget) => void;
  onDeleteCard: (card: BoardItem) => void;
  onDeleteColumn: (column: BoardItem, cardCount: number) => void;
  onEditCard: (cardId: string) => void;
  onEditColumn: (columnId: string) => void;
  onStartCardComposer: (columnId: string) => void;
  onStartCardDrag: (cardId: string, columnId: string) => void;
  onStartColumnDrag: (columnId: string) => void;
  onSubmitCard: (cardId: string, updates: CardUpdates) => void;
  onSubmitColumn: (columnId: string, updates: ColumnUpdates) => void;
}) {
  const { t } = useTranslation(undefined, { keyPrefix: "kanban" });
  const columnContent = getColumnContent(column);

  return (
    <section
      className="kanban-column"
      data-ai-change-active={Boolean(aiChangeKind) || undefined}
      data-ai-change-kind={aiChangeKind}
      data-ai-change-token={aiChangeKind ? aiChangeToken : undefined}
      data-column-dragging={isColumnDragging}
      data-column-drop-edge={columnDropEdge}
      onDragOver={(event) => {
        event.preventDefault();

        onColumnDragOver({ columnId: column.id, edge: getColumnEdge(event) });
      }}
      onDrop={(event) => {
        event.preventDefault();

        onColumnDrop({ columnId: column.id, edge: getColumnEdge(event) });
      }}
    >
      <header
        className="kanban-column__header"
        draggable={!isEditingColumn}
        onDragStart={(event) => {
          if (isEditingColumn) {
            event.preventDefault();
            return;
          }

          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", column.id);
          onStartColumnDrag(column.id);
        }}
        onDragEnd={onClearDragState}
      >
        {isEditingColumn ? (
          <ColumnEditor
            data={column}
            onCancel={onCancelColumnEdit}
            onDelete={() => onDeleteColumn(column, cards.length)}
            onSubmit={(updates) => onSubmitColumn(column.id, updates)}
          />
        ) : (
          <>
            <div className="kanban-column__handle" aria-hidden="true">
              <GripVertical size={15} />
            </div>
            <div
              className="kanban-column__accent"
              style={{ backgroundColor: columnContent?.color }}
            />
            <button
              aria-label={t("actions.editColumn", { title: column.title })}
              className="kanban-column__summary"
              onClick={() => onEditColumn(column.id)}
              type="button"
            >
              <div className="kanban-column__title-row">
                <div>
                  <h2>{column.title}</h2>
                  <p>{columnContent?.description}</p>
                </div>
              </div>
            </button>
            <span>{column.totalItemsCount ?? cards.length}</span>
          </>
        )}
      </header>

      <div className="kanban-column__list">
        {cards.map((card) => (
          <CardShell
            aiChangeKind={
              aiChangedCardIds.includes(card.id) ? cardAIChangeKind : undefined
            }
            aiChangeToken={aiChangeToken}
            card={card}
            column={column}
            dropEdge={
              cardDropTarget?.columnId === column.id &&
              cardDropTarget.cardId === card.id
                ? cardDropTarget.edge
                : undefined
            }
            isEditing={editingCardId === card.id}
            key={card.id}
            onCancelEdit={onCancelCardEdit}
            onDelete={onDeleteCard}
            onDragEnd={onClearDragState}
            onDragOver={onCardDragOver}
            onDrop={onCardDrop}
            onEdit={onEditCard}
            onSubmit={onSubmitCard}
            onDragStart={onStartCardDrag}
          />
        ))}

        {cards.length === 0 ? (
          <div
            className="kanban-column__empty"
            data-drop-active={
              cardDropTarget?.columnId === column.id &&
              cardDropTarget.cardId === null
            }
          >
            {t("board.noCards")}
          </div>
        ) : null}

        {isAddingCard ? (
          <InlineComposer
            onCancel={onCancelCardComposer}
            onSubmit={(title) => onAddCard(column.id, title)}
            placeholder={t("forms.cardTitlePlaceholder")}
            submitLabel={t("actions.addCard")}
          />
        ) : (
          <button
            className="kanban-add-inline kanban-add-inline--card"
            onClick={() => onStartCardComposer(column.id)}
            type="button"
          >
            <Plus size={14} />
            {t("actions.addCard")}
          </button>
        )}
      </div>
    </section>
  );
});
