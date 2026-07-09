import { ChartPreview } from "@/components/tiptap/ai-menu/ChartPreview";
import { withEditorCommandState } from "@/components/tiptap/editorGuards";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useNoModelSelectedToast } from "@/hooks/useNoModelSelectedToast";
import { buildPrompt } from "@/lib/ai/prompts";
import { getModelFromConfig } from "@/lib/ai/provider";
import { cn } from "@/lib/utils";
import {
  type ChartType,
  CHART_TYPES,
  parseChartConfig,
} from "@/lib/visualization/chartjs";
import { useStore } from "@/store/useStore";
import {
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useFloating,
} from "@floating-ui/react";
import { Node as PMNode } from "@tiptap/pm/model";
import {
  Editor,
  findParentNode,
  posToDOMRect,
  useEditorState,
} from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { streamText } from "ai";
import {
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  BarChart3,
  Columns,
  Combine,
  Loader2,
  Rows,
  Trash2,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface TableFloatingToolbarProps {
  editor: Editor;
}

interface ShouldShowProps {
  state: {
    selection: unknown;
  } | null;
}

const TableToolbarButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  tooltip: string;
  variant?: "default" | "destructive";
}> = React.memo(
  ({ onClick, disabled, children, tooltip, variant = "default" }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClick();
          }}
          disabled={disabled}
          className={cn(
            "rounded-md p-1.5 transition-colors disabled:opacity-50",
            variant === "default" &&
              "hover:bg-accent hover:text-accent-foreground",
            variant === "destructive" &&
              "hover:bg-destructive hover:text-destructive-foreground",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="text-xs">{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  ),
);

TableToolbarButton.displayName = "TableToolbarButton";

const Separator: React.FC = () => <div className="mx-0.5 h-5 w-px bg-border" />;

const minChartPreviewHeight = 360;

function getEditorViewSafely(editor: Editor) {
  try {
    return editor.isDestroyed ? null : editor.view;
  } catch {
    return null;
  }
}

/**
 * Extracts structured text content from a Tiptap table node.
 * Walks the ProseMirror node tree to read header and body cells,
 * returning a pipe-delimited table string suitable for AI processing.
 */
const extractTableText = (tableNode: PMNode): string => {
  const rows: string[][] = [];

  tableNode.forEach((row) => {
    if (row.type.name === "tableRow") {
      const cells: string[] = [];
      row.forEach((cell) => {
        if (
          cell.type.name === "tableCell" ||
          cell.type.name === "tableHeader"
        ) {
          cells.push(cell.textContent.trim());
        }
      });
      rows.push(cells);
    }
  });

  if (rows.length === 0) return "";

  return rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
};

interface TableFloatingToolbarState {
  isInTable: boolean;
  canAddRowBefore: boolean;
  canAddRowAfter: boolean;
  canAddColumnBefore: boolean;
  canAddColumnAfter: boolean;
  canDeleteRow: boolean;
  canDeleteColumn: boolean;
  canMergeOrSplit: boolean;
  canDeleteTable: boolean;
}

/** Disabled table toolbar state used when the editor is unavailable. */
const DEFAULT_TABLE_TOOLBAR_STATE: TableFloatingToolbarState = {
  isInTable: false,
  canAddRowBefore: false,
  canAddRowAfter: false,
  canAddColumnBefore: false,
  canAddColumnAfter: false,
  canDeleteRow: false,
  canDeleteColumn: false,
  canMergeOrSplit: false,
  canDeleteTable: false,
};

/** Selects table command availability, safely handling destroyed editors. */
export function selectTableFloatingToolbarState(
  currentEditor: Editor | null | undefined,
): TableFloatingToolbarState {
  return withEditorCommandState(
    currentEditor,
    (editor) => {
      const isInTable = editor.isActive("table");

      if (!isInTable) {
        return {
          ...DEFAULT_TABLE_TOOLBAR_STATE,
          isInTable,
        };
      }

      return {
        isInTable,
        canAddRowBefore: editor.can().addRowBefore(),
        canAddRowAfter: editor.can().addRowAfter(),
        canAddColumnBefore: editor.can().addColumnBefore(),
        canAddColumnAfter: editor.can().addColumnAfter(),
        canDeleteRow: editor.can().deleteRow(),
        canDeleteColumn: editor.can().deleteColumn(),
        canMergeOrSplit: editor.can().mergeOrSplit(),
        canDeleteTable: editor.can().deleteTable(),
      };
    },
    DEFAULT_TABLE_TOOLBAR_STATE,
  );
}

/**
 * Floating toolbar that appears when cursor is inside a table.
 * Provides essential table manipulation operations and AI-powered chart generation.
 * Supports Line, Bar, Pie, Radar, and Bubble chart types via a popover dropdown.
 */
export const TableFloatingToolbar: React.FC<TableFloatingToolbarProps> =
  React.memo(({ editor }) => {
    const { t } = useTranslation();
    const showNoModelSelectedToast = useNoModelSelectedToast();
    const iconSize = 16;

    const [isChartLoading, setIsChartLoading] = useState(false);
    const [chartRawJson, setChartRawJson] = useState<string | null>(null);
    const isChartPreviewOpen = isChartLoading || chartRawJson !== null;

    const modelConfigs = useStore((state) => state.modelConfigs);
    const activeConfigId = useStore((state) => state.activeConfigId);
    const selectedModelId = useStore((state) => state.selectedModelId);

    // Use useEditorState for reactive state to avoid infinite loops
    const editorState = useEditorState({
      editor,
      selector: (ctx) => selectTableFloatingToolbarState(ctx.editor),
    });

    const shouldShow = useCallback(
      ({ state }: ShouldShowProps) => {
        if (!state) {
          return false;
        }
        return editorState.isInTable;
      },
      [editorState.isInTable],
    );

    const getReferencedVirtualElement = useCallback(() => {
      const view = getEditorViewSafely(editor);
      if (!view) {
        return null;
      }

      const { selection } = editor.state;
      const predicate = (node: PMNode) => node.type.name === "table";
      const parent = findParentNode(predicate)(selection);

      if (parent) {
        const dom = view.nodeDOM(parent?.pos) as HTMLElement;
        if (dom) {
          const rect = dom.getBoundingClientRect();
          return {
            getBoundingClientRect: () => rect,
            getClientRects: () => [rect],
          };
        }
      }

      const rect = posToDOMRect(view, selection.from, selection.to);
      return {
        getBoundingClientRect: () => rect,
        getClientRects: () => [rect],
      };
    }, [editor]);

    const getChartPreviewReferenceRect = useCallback(() => {
      const view = getEditorViewSafely(editor);
      if (!view) {
        return new DOMRect();
      }

      const { selection } = editor.state;
      const predicate = (node: PMNode) => node.type.name === "table";
      const parent = findParentNode(predicate)(selection);

      if (parent) {
        const dom = view.nodeDOM(parent.pos) as HTMLElement | null;
        if (dom) {
          return dom.getBoundingClientRect();
        }
      }

      return posToDOMRect(view, selection.from, selection.to);
    }, [editor]);

    const chartPreviewReference = useMemo(() => {
      const view = getEditorViewSafely(editor);

      return {
        contextElement: view?.dom,
        getBoundingClientRect: getChartPreviewReferenceRect,
        getClientRects: () =>
          [getChartPreviewReferenceRect()] as unknown as DOMRectList,
      };
    }, [editor, getChartPreviewReferenceRect]);

    const {
      refs: chartPreviewRefs,
      floatingStyles: chartPreviewFloatingStyles,
    } = useFloating({
      open: isChartPreviewOpen,
      placement: "bottom-start",
      middleware: [
        offset(12),
        size({
          padding: 8,
          apply({ availableHeight, elements }) {
            Object.assign(elements.floating.style, {
              maxHeight: `${Math.max(minChartPreviewHeight, availableHeight)}px`,
            });
          },
        }),
        flip({
          fallbackPlacements: ["top-start", "bottom-end", "top-end"],
          fallbackStrategy: "initialPlacement",
        }),
        shift({ padding: 8 }),
      ],
      whileElementsMounted: autoUpdate,
    });

    useEffect(() => {
      if (isChartPreviewOpen) {
        const view = getEditorViewSafely(editor);
        if (!view) {
          return;
        }

        chartPreviewRefs.setReference(chartPreviewReference);
      }
    }, [chartPreviewReference, chartPreviewRefs, editor, isChartPreviewOpen]);

    // Memoize options to prevent recreation on each render
    const bubbleMenuOptions = useMemo(
      () => ({
        placement: "top" as const,
        offset: {
          mainAxis: 12,
        },
        flip: {
          fallbackPlacements: ["top" as const, "bottom" as const],
          padding: { top: 50, left: 8, right: 8, bottom: -Infinity },
          boundary: editor.options.element as HTMLElement,
        },
        shift: {
          padding: 8,
          crossAxis: true,
        },
      }),
      [editor.options.element],
    );

    // Memoize action handlers
    const handleAddRowBefore = useCallback(
      () => editor.chain().focus().addRowBefore().run(),
      [editor],
    );
    const handleAddRowAfter = useCallback(
      () => editor.chain().focus().addRowAfter().run(),
      [editor],
    );
    const handleAddColumnBefore = useCallback(
      () => editor.chain().focus().addColumnBefore().run(),
      [editor],
    );
    const handleAddColumnAfter = useCallback(
      () => editor.chain().focus().addColumnAfter().run(),
      [editor],
    );
    const handleDeleteRow = useCallback(
      () => editor.chain().focus().deleteRow().run(),
      [editor],
    );
    const handleDeleteColumn = useCallback(
      () => editor.chain().focus().deleteColumn().run(),
      [editor],
    );
    const handleMergeOrSplit = useCallback(
      () => editor.chain().focus().mergeOrSplit().run(),
      [editor],
    );
    const handleDeleteTable = useCallback(
      () => editor.chain().focus().deleteTable().run(),
      [editor],
    );

    const handleCreateChart = useCallback(
      async (chartType: ChartType) => {
        const { selection } = editor.state;
        const predicate = (node: PMNode) => node.type.name === "table";
        const parent = findParentNode(predicate)(selection);

        if (!parent) {
          toast.error(t("aiMenu.errors.noSelection"));
          return;
        }

        const tableText = extractTableText(parent.node);
        if (!tableText.trim()) {
          toast.error(t("aiMenu.errors.noSelection"));
          return;
        }

        const activeConfig = modelConfigs.find((c) => c.id === activeConfigId);
        if (!activeConfig || !selectedModelId) {
          showNoModelSelectedToast();
          return;
        }

        setIsChartLoading(true);
        setChartRawJson(null);

        try {
          console.log(
            "Generating chart with prompt:",
            buildPrompt("chart", tableText, t, chartType),
          );

          const result = streamText({
            model: await getModelFromConfig(activeConfig, selectedModelId),
            prompt: buildPrompt("chart", tableText, t, chartType),
          });

          let fullText = "";
          for await (const chunk of result.textStream) {
            fullText += chunk;
          }

          if (!fullText.trim()) {
            toast.error(t("aiMenu.errors.emptyResponse"));
            return;
          }

          const parsed = parseChartConfig(fullText);
          if (parsed) {
            setChartRawJson(fullText);
          } else {
            toast.error(t("aiMenu.chartParseError"));
          }
        } catch (error) {
          console.error("Chart generation from table failed:", error);
          toast.error(t("aiMenu.errors.failed"));
        } finally {
          setIsChartLoading(false);
        }
      },
      [
        activeConfigId,
        editor,
        modelConfigs,
        selectedModelId,
        showNoModelSelectedToast,
        t,
      ],
    );

    const handleDiscardChart = useCallback(() => {
      setChartRawJson(null);
    }, []);

    const handleInsertChart = useCallback(() => {
      if (!chartRawJson) return;

      const { selection } = editor.state;
      const predicate = (node: PMNode) => node.type.name === "table";
      const parent = findParentNode(predicate)(selection);

      // Insert after the table node
      const insertPos = parent
        ? parent.pos + parent.node.nodeSize
        : selection.to;

      try {
        const success = editor
          .chain()
          .focus()
          .insertContentAt(insertPos, [
            {
              type: "paragraph",
            },
            {
              type: "chart",
              attrs: { config: chartRawJson },
            },
          ])
          .run();

        if (!success) {
          throw new Error("Chart insertion failed");
        }

        toast.success(t("aiMenu.chartInserted"));
      } catch (error) {
        console.error("Failed to insert chart:", error);
        toast.error(t("aiMenu.errors.failed"));
      }

      setChartRawJson(null);
    }, [editor, chartRawJson, t]);

    return (
      <>
        <BubbleMenu
          editor={editor}
          pluginKey="table-floating-toolbar"
          resizeDelay={100}
          getReferencedVirtualElement={getReferencedVirtualElement}
          options={bubbleMenuOptions}
          shouldShow={shouldShow}
        >
          <div className="table-floating-toolbar flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-lg">
            {/* Add Row/Column */}
            <TableToolbarButton
              onClick={handleAddRowBefore}
              disabled={!editorState.canAddRowBefore}
              tooltip={t("editor.table.addRowBefore")}
            >
              <ArrowUpToLine size={iconSize} />
            </TableToolbarButton>
            <TableToolbarButton
              onClick={handleAddRowAfter}
              disabled={!editorState.canAddRowAfter}
              tooltip={t("editor.table.addRowAfter")}
            >
              <ArrowDownToLine size={iconSize} />
            </TableToolbarButton>
            <TableToolbarButton
              onClick={handleAddColumnBefore}
              disabled={!editorState.canAddColumnBefore}
              tooltip={t("editor.table.addColumnBefore")}
            >
              <ArrowLeftToLine size={iconSize} />
            </TableToolbarButton>
            <TableToolbarButton
              onClick={handleAddColumnAfter}
              disabled={!editorState.canAddColumnAfter}
              tooltip={t("editor.table.addColumnAfter")}
            >
              <ArrowRightToLine size={iconSize} />
            </TableToolbarButton>

            <Separator />

            {/* Delete Row/Column */}
            <TableToolbarButton
              onClick={handleDeleteRow}
              disabled={!editorState.canDeleteRow}
              tooltip={t("editor.table.deleteRow")}
              variant="destructive"
            >
              <Rows size={iconSize} />
            </TableToolbarButton>
            <TableToolbarButton
              onClick={handleDeleteColumn}
              disabled={!editorState.canDeleteColumn}
              tooltip={t("editor.table.deleteColumn")}
              variant="destructive"
            >
              <Columns size={iconSize} />
            </TableToolbarButton>

            <Separator />

            {/* Merge/Split */}
            <TableToolbarButton
              onClick={handleMergeOrSplit}
              disabled={!editorState.canMergeOrSplit}
              tooltip={t("editor.table.mergeOrSplit")}
            >
              <Combine size={iconSize} />
            </TableToolbarButton>

            <Separator />

            {/* Create Chart — dropdown with chart type selection */}
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      disabled={isChartLoading || !editorState.isInTable}
                      className="rounded-md p-1.5 transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                    >
                      {isChartLoading ? (
                        <Loader2 size={iconSize} className="animate-spin" />
                      ) : (
                        <BarChart3 size={iconSize} />
                      )}
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">{t("editor.table.createChart")}</p>
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent
                portal={false}
                align="center"
                side="top"
                sideOffset={8}
              >
                {CHART_TYPES.map((chartType) => (
                  <DropdownMenuItem
                    key={chartType}
                    onSelect={() => handleCreateChart(chartType)}
                  >
                    {t(`aiMenu.chartTypes.${chartType}`)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Separator />

            {/* Delete Table */}
            <TableToolbarButton
              onClick={handleDeleteTable}
              disabled={!editorState.canDeleteTable}
              tooltip={t("editor.table.deleteTable")}
              variant="destructive"
            >
              <Trash2 size={iconSize} />
            </TableToolbarButton>
          </div>
        </BubbleMenu>

        {/* Chart Preview */}
        {isChartPreviewOpen &&
          createPortal(
            <div
              ref={chartPreviewRefs.setFloating}
              style={chartPreviewFloatingStyles}
              className="z-50 flex w-[calc(100vw-2rem)] max-w-xl flex-col overflow-hidden rounded-lg border bg-popover shadow-lg"
              onMouseDown={(e) => e.preventDefault()}
            >
              <ChartPreview
                chartContent={chartRawJson ?? ""}
                isLoading={isChartLoading}
                onDiscard={handleDiscardChart}
                onInsertAtPosition={handleInsertChart}
              />
            </div>,
            document.body,
          )}
      </>
    );
  });

TableFloatingToolbar.displayName = "TableFloatingToolbar";
