import { Plus, Sparkles } from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { AddColumnComposer } from "@/components/kanban-pro/AddColumnComposer";
import { BoardColumn } from "@/components/kanban-pro/BoardColumn";
import { BoardSummary } from "@/components/kanban-pro/BoardSummary";
import { Button } from "@/components/ui/button";
import type { KanbanAIService } from "@/lib/kanban/ai/kanban-ai-service";
import type {
  AIMessage,
  KanbanChange,
  PendingKanbanAction,
} from "@/lib/kanban/ai/kanban-ai.types";
import type { KanbanAPIService } from "@/lib/kanban/ai/kanban-api-service";
import type {
  CardDropTarget,
  CardUpdates,
  ColumnDropTarget,
  ColumnUpdates,
  DragState,
} from "@/lib/kanban/kanban-board.shared";
import {
  addCard,
  addColumn,
  deleteCard,
  deleteColumn,
  getChildren,
  getColumns,
  moveCard,
  moveColumn,
  updateCard,
  updateColumn,
} from "@/lib/kanban/kanban-board.utils";
import type { BoardData, BoardItem } from "@/lib/kanban/types";
import { useStore } from "@/store/useStore";
import { aiAssistantToggleClassName } from "@/styles/aiAssistantClassNames";
import "./kanban-board.css";

function loadAIAssistantComponent() {
  return import("@/components/kanban-pro/AIAssistant").then((module) => ({
    default: module.AIAssistant,
  }));
}

const AIAssistant = lazy(loadAIAssistantComponent);

const EMPTY_CHANGED_ITEM_IDS: string[] = [];

type AIChangeEffect = {
  itemIds: string[];
  itemType: KanbanChange["itemType"];
  kind: Exclude<KanbanChange["kind"], "deleted">;
  token: number;
};

interface KanbanBoardProps {
  data: BoardData;
  onChange: (data: BoardData) => void;
}

/** Embeds the kanban-pro board as a controlled note block. */
export function KanbanBoard({ data, onChange }: KanbanBoardProps) {
  const { t } = useTranslation(undefined, { keyPrefix: "kanban" });
  const [dataSource, setDataSource] = useState<BoardData>(data);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [cardDropTarget, setCardDropTarget] = useState<CardDropTarget | null>(
    null,
  );
  const [columnDropTarget, setColumnDropTarget] =
    useState<ColumnDropTarget | null>(null);
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [activeCardComposerColumnId, setActiveCardComposerColumnId] = useState<
    string | null
  >(null);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([]);
  const [pendingAIConfirmation, setPendingAIConfirmation] =
    useState<PendingKanbanAction>();
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiChangeEffect, setAIChangeEffect] = useState<AIChangeEffect | null>(
    null,
  );
  const kanbanAPIRef = useRef<KanbanAPIService | null>(null);
  const aiServiceRef = useRef<KanbanAIService | null>(null);
  const aiServiceLoadPromiseRef = useRef<Promise<KanbanAIService> | null>(null);
  const boardDataRef = useRef(dataSource);
  const aiChangeEffectTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    boardDataRef.current = data;
    setDataSource(data);
  }, [data]);

  const commitDataSource = useCallback(
    (updater: BoardData | ((current: BoardData) => BoardData)) => {
      const nextData =
        typeof updater === "function" ? updater(boardDataRef.current) : updater;

      boardDataRef.current = nextData;
      setDataSource(nextData);
      onChange(nextData);
    },
    [onChange],
  );

  const columns = useMemo(() => getColumns(dataSource), [dataSource]);
  const columnsWithCards = useMemo(
    () =>
      columns.map((column) => ({
        column,
        cards: getChildren(dataSource, column),
      })),
    [columns, dataSource],
  );
  const totalCards = useMemo(
    () =>
      columns.reduce(
        (total, column) =>
          total + (column.totalItemsCount ?? column.children.length),
        0,
      ),
    [columns],
  );
  const aiChangedCardIds =
    aiChangeEffect?.itemType === "card"
      ? aiChangeEffect.itemIds
      : EMPTY_CHANGED_ITEM_IDS;
  const aiChangedColumnIds =
    aiChangeEffect?.itemType === "column"
      ? aiChangeEffect.itemIds
      : EMPTY_CHANGED_ITEM_IDS;

  useEffect(() => {
    return () => {
      if (aiChangeEffectTimeoutRef.current) {
        window.clearTimeout(aiChangeEffectTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!aiChangeEffect) {
      return;
    }

    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>("[data-ai-change-active='true']")
        ?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
    });
  }, [aiChangeEffect]);

  const clearDragState = useCallback(() => {
    setDragState(null);
    setCardDropTarget(null);
    setColumnDropTarget(null);
  }, []);

  const handleAIBoardChange = useCallback(
    (board: BoardData, change?: KanbanChange) => {
      commitDataSource(board);
      clearDragState();

      if (change && change.kind !== "deleted" && change.itemIds.length > 0) {
        const token = Date.now();

        setAIChangeEffect({
          itemIds: change.itemIds,
          itemType: change.itemType,
          kind: change.kind,
          token,
        });

        if (aiChangeEffectTimeoutRef.current) {
          window.clearTimeout(aiChangeEffectTimeoutRef.current);
        }

        aiChangeEffectTimeoutRef.current = window.setTimeout(() => {
          setAIChangeEffect((current) =>
            current?.token === token ? null : current,
          );
        }, 3200);
      }

      if (change?.kind === "deleted" || change?.kind === "moved") {
        setEditingCardId((current) => {
          if (!current) {
            return current;
          }

          if (board[current]) {
            return change.itemType === "card" &&
              change.itemIds.includes(current)
              ? null
              : current;
          }

          return null;
        });
        setEditingColumnId((current) => {
          if (!current) {
            return current;
          }

          if (board[current]) {
            return change.itemType === "column" &&
              change.itemIds.includes(current)
              ? null
              : current;
          }

          return null;
        });
        setActiveCardComposerColumnId((current) => {
          if (!current) {
            return current;
          }

          if (board[current]) {
            return change.itemType === "column" &&
              change.itemIds.includes(current)
              ? null
              : current;
          }

          return null;
        });
      }
    },
    [clearDragState, commitDataSource],
  );

  useEffect(() => {
    boardDataRef.current = dataSource;
    kanbanAPIRef.current?.setBoard(dataSource);
  }, [dataSource]);

  const loadAIService = useCallback(async () => {
    if (aiServiceRef.current) {
      return aiServiceRef.current;
    }

    if (!aiServiceLoadPromiseRef.current) {
      aiServiceLoadPromiseRef.current = Promise.all([
        import("@/lib/kanban/ai/kanban-api-service"),
        import("@/lib/kanban/ai/kanban-ai-service"),
        import("@/lib/kanban/ai/kanban-ai-provider"),
      ]).then(([apiModule, aiModule, providerModule]) => {
        const kanbanAPI = new apiModule.KanbanAPIService(
          boardDataRef.current,
          handleAIBoardChange,
        );
        const aiService = new aiModule.KanbanAIService(
          kanbanAPI,
          new providerModule.KanbanAIProvider(() => {
            const { activeConfigId, modelConfigs, selectedModelId } =
              useStore.getState();

            return {
              config:
                modelConfigs.find((config) => config.id === activeConfigId) ||
                null,
              modelId: selectedModelId,
            };
          }),
        );

        kanbanAPIRef.current = kanbanAPI;
        aiServiceRef.current = aiService;

        return aiService;
      });
    }

    return aiServiceLoadPromiseRef.current;
  }, [handleAIBoardChange]);

  const handleAddColumn = useCallback(
    ({
      title,
      description,
      color,
    }: {
      title: string;
      description: string;
      color: string;
    }) => {
      commitDataSource((current) =>
        addColumn(current, title, description, color),
      );
      setIsAddingColumn(false);
    },
    [commitDataSource],
  );

  const handleAddCard = useCallback(
    (columnId: string, title: string) => {
      commitDataSource((current) => addCard(current, columnId, title));
      setActiveCardComposerColumnId(null);
    },
    [commitDataSource],
  );

  const handleCancelCardComposer = useCallback(() => {
    setActiveCardComposerColumnId(null);
  }, []);

  const handleCancelCardEdit = useCallback(() => {
    setEditingCardId(null);
  }, []);

  const handleCancelColumnEdit = useCallback(() => {
    setEditingColumnId(null);
  }, []);

  const handleSubmitCard = useCallback(
    (cardId: string, updates: CardUpdates) => {
      commitDataSource((current) => updateCard(current, cardId, updates));
      setEditingCardId(null);
    },
    [commitDataSource],
  );

  const handleSubmitColumn = useCallback(
    (columnId: string, updates: ColumnUpdates) => {
      commitDataSource((current) => updateColumn(current, columnId, updates));
      setEditingColumnId(null);
    },
    [commitDataSource],
  );

  const handleDeleteCard = useCallback(
    (card: BoardItem) => {
      const shouldDelete = window.confirm(
        t("dialogs.deleteCard", { title: card.title }),
      );

      if (!shouldDelete) {
        return;
      }

      commitDataSource((current) => deleteCard(current, card.id));
      setEditingCardId((current) => (current === card.id ? null : current));
    },
    [commitDataSource, t],
  );

  const handleDeleteColumn = useCallback(
    (column: BoardItem, cardCount: number) => {
      const shouldDelete = window.confirm(
        t("dialogs.deleteColumn", { count: cardCount, title: column.title }),
      );

      if (!shouldDelete) {
        return;
      }

      commitDataSource((current) => deleteColumn(current, column.id));
      setEditingColumnId(null);
      setActiveCardComposerColumnId((current) =>
        current === column.id ? null : current,
      );
    },
    [commitDataSource, t],
  );

  const handleStartCardDrag = useCallback(
    (cardId: string, columnId: string) => {
      setDragState({ type: "card", cardId, fromColumnId: columnId });
    },
    [],
  );

  const handleStartColumnDrag = useCallback((columnId: string) => {
    setDragState({ type: "column", columnId });
  }, []);

  const handleCardDragOver = useCallback(
    (target: CardDropTarget) => {
      if (!dragState || dragState.type !== "card") {
        return;
      }

      setCardDropTarget(target);
      setColumnDropTarget(null);
    },
    [dragState],
  );

  const handleCardDrop = useCallback(
    (target: CardDropTarget) => {
      if (!dragState || dragState.type !== "card") {
        return;
      }

      commitDataSource((current) =>
        moveCard(current, {
          cardId: dragState.cardId,
          fromColumnId: dragState.fromColumnId,
          toColumnId: target.columnId,
          targetCardId: target.cardId,
          edge: target.edge,
        }),
      );
      clearDragState();
    },
    [clearDragState, commitDataSource, dragState],
  );

  const handleColumnDragOver = useCallback(
    (target: ColumnDropTarget) => {
      if (!dragState) {
        return;
      }

      if (dragState.type === "column") {
        setColumnDropTarget(target);
        setCardDropTarget(null);
        return;
      }

      setCardDropTarget({
        columnId: target.columnId,
        cardId: null,
        edge: "end",
      });
      setColumnDropTarget(null);
    },
    [dragState],
  );

  const handleColumnDrop = useCallback(
    (target: ColumnDropTarget) => {
      if (!dragState || dragState.type !== "column") {
        return;
      }

      commitDataSource((current) =>
        moveColumn(current, dragState.columnId, target.columnId, target.edge),
      );
      clearDragState();
    },
    [clearDragState, commitDataSource, dragState],
  );

  const handleColumnAreaDrop = useCallback(
    (target: ColumnDropTarget) => {
      if (dragState?.type === "column") {
        handleColumnDrop(target);
        return;
      }

      handleCardDrop({ columnId: target.columnId, cardId: null, edge: "end" });
    },
    [dragState, handleCardDrop, handleColumnDrop],
  );

  const handleAIMessage = useCallback(
    async (message: string) => {
      setAiProcessing(true);

      try {
        const aiService = await loadAIService();
        const processingPromise = aiService.processMessage(message);
        setAiMessages(aiService.getMessages());
        setPendingAIConfirmation(aiService.getPendingConfirmation());

        await processingPromise;
        setAiMessages(aiService.getMessages());
        setPendingAIConfirmation(aiService.getPendingConfirmation());
      } catch (error) {
        console.error("AI processing error:", error);
      } finally {
        setAiProcessing(false);
      }
    },
    [loadAIService],
  );

  const handleAIConfirm = useCallback(async () => {
    setAiProcessing(true);

    try {
      const aiService = await loadAIService();
      await aiService.confirmPendingAction();
      setAiMessages(aiService.getMessages());
      setPendingAIConfirmation(aiService.getPendingConfirmation());
    } catch (error) {
      console.error("AI confirmation error:", error);
    } finally {
      setAiProcessing(false);
    }
  }, [loadAIService]);

  const handleAICancel = useCallback(async () => {
    const aiService = await loadAIService();

    aiService.cancelPendingAction();
    setAiMessages(aiService.getMessages());
    setPendingAIConfirmation(aiService.getPendingConfirmation());
  }, [loadAIService]);

  const handleAIReset = useCallback(() => {
    if (!aiServiceRef.current || aiProcessing) {
      return;
    }

    aiServiceRef.current.clearHistory();
    setAiMessages([]);
    setPendingAIConfirmation(undefined);
  }, [aiProcessing]);

  const handleToggleAI = useCallback(() => {
    setAiOpen((current) => {
      if (!current) {
        void loadAIService();
      }

      return !current;
    });
  }, [loadAIService]);

  const preloadAI = useCallback(() => {
    void loadAIAssistantComponent();
    void loadAIService();
  }, [loadAIService]);

  return (
    <main className="kanban-screen">
      <header className="kanban-screen__header">
        <div>
          <h1>Kanban</h1>
        </div>
        <div className="kanban-screen__tools">
          <BoardSummary columnCount={columns.length} totalCards={totalCards} />
        </div>
      </header>

      <section className="kanban-board" aria-label={t("board.ariaLabel")}>
        {columnsWithCards.map(({ column, cards }) => (
          <BoardColumn
            cardDropTarget={
              cardDropTarget?.columnId === column.id ? cardDropTarget : null
            }
            aiChangeKind={
              aiChangedColumnIds.includes(column.id)
                ? aiChangeEffect?.kind
                : undefined
            }
            aiChangeToken={aiChangeEffect?.token}
            aiChangedCardIds={aiChangedCardIds}
            cardAIChangeKind={
              aiChangeEffect?.itemType === "card"
                ? aiChangeEffect.kind
                : undefined
            }
            cards={cards}
            column={column}
            columnDropEdge={
              columnDropTarget?.columnId === column.id
                ? columnDropTarget.edge
                : undefined
            }
            editingCardId={
              cards.some((card) => card.id === editingCardId)
                ? editingCardId
                : null
            }
            isAddingCard={activeCardComposerColumnId === column.id}
            isColumnDragging={
              dragState?.type === "column" && dragState.columnId === column.id
            }
            isEditingColumn={editingColumnId === column.id}
            key={column.id}
            onAddCard={handleAddCard}
            onCancelCardComposer={handleCancelCardComposer}
            onCancelCardEdit={handleCancelCardEdit}
            onCancelColumnEdit={handleCancelColumnEdit}
            onCardDragOver={handleCardDragOver}
            onCardDrop={handleCardDrop}
            onClearDragState={clearDragState}
            onColumnDragOver={handleColumnDragOver}
            onColumnDrop={handleColumnAreaDrop}
            onDeleteCard={handleDeleteCard}
            onDeleteColumn={handleDeleteColumn}
            onEditCard={setEditingCardId}
            onEditColumn={setEditingColumnId}
            onStartCardComposer={setActiveCardComposerColumnId}
            onStartCardDrag={handleStartCardDrag}
            onStartColumnDrag={handleStartColumnDrag}
            onSubmitCard={handleSubmitCard}
            onSubmitColumn={handleSubmitColumn}
          />
        ))}

        {isAddingColumn ? (
          <AddColumnComposer
            onCancel={() => setIsAddingColumn(false)}
            onSubmit={handleAddColumn}
          />
        ) : (
          <button
            className="kanban-add-column"
            onClick={() => setIsAddingColumn(true)}
            type="button"
          >
            <Plus size={16} />
            {t("actions.addColumn")}
          </button>
        )}
      </section>
      {!aiOpen ? (
        <Button
          aria-label={t("ai.openAriaLabel")}
          className={aiAssistantToggleClassName}
          onFocus={preloadAI}
          onClick={handleToggleAI}
          onPointerEnter={preloadAI}
          size="icon-lg"
          type="button"
        >
          <Sparkles size={20} />
        </Button>
      ) : (
        <Suspense fallback={null}>
          <AIAssistant
            isOpen={aiOpen}
            isProcessing={aiProcessing}
            messages={aiMessages}
            onCancel={handleAICancel}
            onConfirm={handleAIConfirm}
            onReset={handleAIReset}
            onSubmit={handleAIMessage}
            onToggle={handleToggleAI}
            pendingConfirmation={pendingAIConfirmation}
          />
        </Suspense>
      )}
    </main>
  );
}
