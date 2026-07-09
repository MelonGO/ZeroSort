import {
  ColorPicker,
  HIGHLIGHT_COLORS,
  TEXT_COLORS,
} from "@/components/tiptap/ColorPicker";
import { withEditorCommandState } from "@/components/tiptap/editorGuards";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLicenseGate } from "@/hooks/useLicenseGate";
import { showProFeatureLockedToast } from "@/lib/proFeatureGate";
import { cn } from "@/lib/utils";
import type { AiMenuMode, ToolbarGroupVisibility } from "@/types";
import { useNavigate } from "@tanstack/react-router";
import { Editor, useEditorState } from "@tiptap/react";
import {
  ALargeSmall,
  Bold,
  CalendarDays,
  CheckSquare,
  Clipboard,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  ImageIcon,
  Indent,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  MoreHorizontal,
  Outdent,
  PenLine,
  Pi,
  Quote,
  Redo,
  Sigma,
  Sparkles,
  SquareCode,
  SquareKanban,
  Strikethrough,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Undo,
  Workflow,
  X,
} from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const DEFAULT_TOOLBAR_GROUPS: ToolbarGroupVisibility = {
  history: true,
  headings: true,
  formatting: true,
  lists: true,
  block: true,
  insert: true,
  tools: true,
};

type ToolbarGroupKey = keyof ToolbarGroupVisibility;

const TOOLBAR_GROUP_ORDER: ToolbarGroupKey[] = [
  "history",
  "headings",
  "formatting",
  "lists",
  "block",
  "insert",
  "tools",
];

const TOOLBAR_GROUP_PRIORITY: ToolbarGroupKey[] = [
  "formatting",
  "history",
  "headings",
  "lists",
  "insert",
  "block",
  "tools",
];

const TOOLBAR_GROUP_WIDTHS: Record<
  ToolbarGroupKey,
  { sm: number; md: number }
> = {
  history: { sm: 56, md: 76 },
  headings: { sm: 84, md: 114 },
  formatting: { sm: 176, md: 228 },
  lists: { sm: 140, md: 186 },
  block: { sm: 112, md: 150 },
  insert: { sm: 196, md: 264 },
  tools: { sm: 136, md: 258 },
};

const TOOLBAR_COMPACT_BREAKPOINT = 640;
const AI_COMPACT_BREAKPOINT = 760;
/** Minimum width reserved for the overflow trigger. */
const OVERFLOW_RESERVED_WIDTH = 52;
const SEPARATOR_RESERVED_WIDTH = 9;

interface EditorToolbarProps {
  editor: Editor;
  size?: "sm" | "md";
  onToggleAiMenu?: () => void;
  aiMenuMode?: AiMenuMode;
  toolbarGroups?: ToolbarGroupVisibility;
  onInsertImage?: () => void;
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  tooltip: string;
  size?: "sm" | "md";
  activeColor?: string | null;
  variant?: "default" | "pro";
  showProBadge?: boolean;
}

interface EditorToolbarState {
  canLiftListItem: boolean;
  canRedo: boolean;
  canSinkListItem: boolean;
  canUndo: boolean;
  highlightColor: string | null;
  isBlockMathActive: boolean;
  isBlockquoteActive: boolean;
  isBoldActive: boolean;
  isBulletListActive: boolean;
  isCodeActive: boolean;
  isCodeBlockActive: boolean;
  isHeading1Active: boolean;
  isHeading2Active: boolean;
  isHeading3Active: boolean;
  isHighlightActive: boolean;
  isImageActive: boolean;
  isInlineMathActive: boolean;
  isItalicActive: boolean;
  isLinkActive: boolean;
  isOrderedListActive: boolean;
  isStrikeActive: boolean;
  isTaskListActive: boolean;
  isTextStyleActive: boolean;
  isUnderlineActive: boolean;
  textColor: string | null;
}

/** Disabled/inactive toolbar state used when the editor is unavailable. */
const DEFAULT_EDITOR_TOOLBAR_STATE: EditorToolbarState = {
  canLiftListItem: false,
  canRedo: false,
  canSinkListItem: false,
  canUndo: false,
  highlightColor: null,
  isBlockMathActive: false,
  isBlockquoteActive: false,
  isBoldActive: false,
  isBulletListActive: false,
  isCodeActive: false,
  isCodeBlockActive: false,
  isHeading1Active: false,
  isHeading2Active: false,
  isHeading3Active: false,
  isHighlightActive: false,
  isImageActive: false,
  isInlineMathActive: false,
  isItalicActive: false,
  isLinkActive: false,
  isOrderedListActive: false,
  isStrikeActive: false,
  isTaskListActive: false,
  isTextStyleActive: false,
  isUnderlineActive: false,
  textColor: null,
};

/** Selects toolbar command/active state, safely handling destroyed editors. */
export function selectEditorToolbarState(
  currentEditor: Editor | null | undefined,
): EditorToolbarState {
  return withEditorCommandState(
    currentEditor,
    (editor) => ({
      canLiftListItem: editor.can().liftListItem("listItem"),
      canRedo: editor.can().redo(),
      canSinkListItem: editor.can().sinkListItem("listItem"),
      canUndo: editor.can().undo(),
      highlightColor:
        (editor.getAttributes("highlight").color as string | null) ?? null,
      isBlockMathActive: editor.isActive("blockMath"),
      isBlockquoteActive: editor.isActive("blockquote"),
      isBoldActive: editor.isActive("bold"),
      isBulletListActive: editor.isActive("bulletList"),
      isCodeActive: editor.isActive("code"),
      isCodeBlockActive: editor.isActive("codeBlock"),
      isHeading1Active: editor.isActive("heading", { level: 1 }),
      isHeading2Active: editor.isActive("heading", { level: 2 }),
      isHeading3Active: editor.isActive("heading", { level: 3 }),
      isHighlightActive: editor.isActive("highlight"),
      isImageActive: editor.isActive("image"),
      isInlineMathActive: editor.isActive("inlineMath"),
      isItalicActive: editor.isActive("italic"),
      isLinkActive: editor.isActive("link"),
      isOrderedListActive: editor.isActive("orderedList"),
      isStrikeActive: editor.isActive("strike"),
      isTaskListActive: editor.isActive("taskList"),
      isTextStyleActive: editor.isActive("textStyle"),
      isUnderlineActive: editor.isActive("underline"),
      textColor:
        (editor.getAttributes("textStyle").color as string | null) ?? null,
    }),
    DEFAULT_EDITOR_TOOLBAR_STATE,
  );
}

function areToolbarStatesEqual(
  previous: EditorToolbarState,
  next: EditorToolbarState | null,
) {
  if (!next) {
    return false;
  }

  return (
    previous.canLiftListItem === next.canLiftListItem &&
    previous.canRedo === next.canRedo &&
    previous.canSinkListItem === next.canSinkListItem &&
    previous.canUndo === next.canUndo &&
    previous.highlightColor === next.highlightColor &&
    previous.isBlockMathActive === next.isBlockMathActive &&
    previous.isBlockquoteActive === next.isBlockquoteActive &&
    previous.isBoldActive === next.isBoldActive &&
    previous.isBulletListActive === next.isBulletListActive &&
    previous.isCodeActive === next.isCodeActive &&
    previous.isCodeBlockActive === next.isCodeBlockActive &&
    previous.isHeading1Active === next.isHeading1Active &&
    previous.isHeading2Active === next.isHeading2Active &&
    previous.isHeading3Active === next.isHeading3Active &&
    previous.isHighlightActive === next.isHighlightActive &&
    previous.isImageActive === next.isImageActive &&
    previous.isInlineMathActive === next.isInlineMathActive &&
    previous.isItalicActive === next.isItalicActive &&
    previous.isLinkActive === next.isLinkActive &&
    previous.isOrderedListActive === next.isOrderedListActive &&
    previous.isStrikeActive === next.isStrikeActive &&
    previous.isTaskListActive === next.isTaskListActive &&
    previous.isTextStyleActive === next.isTextStyleActive &&
    previous.isUnderlineActive === next.isUnderlineActive &&
    previous.textColor === next.textColor
  );
}

const ToolbarButtonComponent: React.FC<ToolbarButtonProps> = ({
  onClick,
  isActive,
  disabled,
  children,
  tooltip,
  size = "md",
  variant = "default",
  showProBadge = false,
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          onClick();
        }}
        disabled={disabled}
        aria-pressed={isActive}
        aria-label={tooltip}
        className={cn(
          "relative",
          size === "sm" ? "p-1" : "p-2",
          "rounded-md transition-colors disabled:opacity-50",
          variant === "pro"
            ? "border border-amber-500/25 bg-amber-500/10 text-amber-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] hover:bg-amber-500/18 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200"
            : "hover:bg-accent hover:text-accent-foreground",
          isActive &&
            (variant === "pro"
              ? "border-amber-500/40 bg-amber-500/20 text-amber-800 dark:text-amber-200"
              : "bg-accent text-accent-foreground"),
        )}
      >
        {children}
        {showProBadge && (
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute rounded-full bg-amber-500 ring-2 ring-background",
              size === "sm"
                ? "top-0.5 right-0.5 h-1.5 w-1.5"
                : "top-1 right-1 h-2 w-2",
            )}
          />
        )}
      </button>
    </TooltipTrigger>
    <TooltipContent side="bottom">
      <p className="text-xs">{tooltip}</p>
    </TooltipContent>
  </Tooltip>
);

const ToolbarButton = React.memo(ToolbarButtonComponent, (prev, next) => {
  return (
    prev.onClick === next.onClick &&
    prev.isActive === next.isActive &&
    prev.disabled === next.disabled &&
    prev.tooltip === next.tooltip &&
    prev.size === next.size &&
    prev.activeColor === next.activeColor &&
    prev.variant === next.variant &&
    prev.showProBadge === next.showProBadge
  );
});

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  editor,
  size = "md",
  onToggleAiMenu,
  aiMenuMode = "off",
  toolbarGroups = DEFAULT_TOOLBAR_GROUPS,
  onInsertImage,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isLicensed } = useLicenseGate();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const groupMeasureRefs = useRef<
    Partial<Record<ToolbarGroupKey, HTMLDivElement | null>>
  >({});
  const highlightPickerAnchorRef = useRef<HTMLDivElement>(null);
  const textColorPickerAnchorRef = useRef<HTMLDivElement>(null);
  const overflowTriggerMeasureRef = useRef<HTMLButtonElement>(null);
  const separatorMeasureRef = useRef<HTMLDivElement>(null);
  const [toolbarWidth, setToolbarWidth] = useState(0);
  const [groupWidths, setGroupWidths] = useState<
    Partial<Record<ToolbarGroupKey, number>>
  >({});
  const [overflowTriggerWidth, setOverflowTriggerWidth] = useState(0);
  const [separatorWidth, setSeparatorWidth] = useState(0);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [mathDialogOpen, setMathDialogOpen] = useState(false);
  const [mathDialogType, setMathDialogType] = useState<"inline" | "block">(
    "inline",
  );

  const openLicenseSettings = useCallback(() => {
    void navigate({ to: "/settings/license" });
  }, [navigate]);

  const handleLockedProFeature = useCallback(
    (featureName: string) => {
      showProFeatureLockedToast(featureName, openLicenseSettings);
    },
    [openLicenseSettings],
  );

  const handleInsertCalendar = useCallback(() => {
    if (!isLicensed) {
      handleLockedProFeature(t("editor.calendar.blockLabel"));
      return;
    }

    setTimeout(() => {
      editor.chain().focus().insertCalendar().run();
    }, 0);
  }, [editor, handleLockedProFeature, isLicensed, t]);

  const handleInsertKanban = useCallback(() => {
    if (!isLicensed) {
      handleLockedProFeature(t("editor.kanban.blockLabel"));
      return;
    }

    setTimeout(() => {
      editor.chain().focus().insertKanban().run();
    }, 0);
  }, [editor, handleLockedProFeature, isLicensed, t]);
  const [mathLatex, setMathLatex] = useState("");
  const [highlightPickerOpen, setHighlightPickerOpen] = useState(false);
  const [textColorPickerOpen, setTextColorPickerOpen] = useState(false);
  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) =>
      selectEditorToolbarState(currentEditor),
    equalityFn: areToolbarStatesEqual,
  });

  const effectiveSize =
    size === "sm" ||
    (toolbarWidth > 0 && toolbarWidth < TOOLBAR_COMPACT_BREAKPOINT)
      ? "sm"
      : "md";
  const iconSize = effectiveSize === "sm" ? 14 : 18;
  const compactAi =
    effectiveSize === "sm" || toolbarWidth < AI_COMPACT_BREAKPOINT;
  const aiModeLabel =
    aiMenuMode === "selection"
      ? t("editor.aiModeSelectionLabel")
      : aiMenuMode === "askAi"
        ? t("editor.aiModeAskAiLabel")
        : t("editor.aiModeOffLabel");
  const aiModeTooltip =
    aiMenuMode === "off"
      ? t("editor.aiAssistant")
      : aiMenuMode === "selection"
        ? t("editor.aiModeSelection")
        : t("editor.aiModeAskAi");
  const separatorClass = cn(
    "mx-1 w-px bg-border",
    effectiveSize === "sm" ? "h-4" : "h-6",
  );

  useEffect(() => {
    const toolbarElement = toolbarRef.current;
    if (!toolbarElement) return;

    const updateToolbarWidth = () => {
      setToolbarWidth(toolbarElement.getBoundingClientRect().width);
    };

    updateToolbarWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateToolbarWidth);
      return () => window.removeEventListener("resize", updateToolbarWidth);
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      setToolbarWidth(entry.contentRect.width);
    });

    resizeObserver.observe(toolbarElement);

    return () => resizeObserver.disconnect();
  }, []);

  const enabledGroupKeys = useMemo(() => {
    return TOOLBAR_GROUP_ORDER.filter((groupKey) => toolbarGroups[groupKey]);
  }, [toolbarGroups]);

  useEffect(() => {
    const updateMeasurements = () => {
      const nextGroupWidths = enabledGroupKeys.reduce(
        (widths, groupKey) => {
          const groupWidth = Math.ceil(
            groupMeasureRefs.current[groupKey]?.getBoundingClientRect().width ||
              0,
          );

          if (groupWidth > 0) {
            widths[groupKey] = groupWidth;
          }

          return widths;
        },
        {} as Partial<Record<ToolbarGroupKey, number>>,
      );

      setGroupWidths((prev) => {
        const didChange = TOOLBAR_GROUP_ORDER.some(
          (groupKey) => prev[groupKey] !== nextGroupWidths[groupKey],
        );

        return didChange ? nextGroupWidths : prev;
      });

      const nextOverflowTriggerWidth = Math.ceil(
        overflowTriggerMeasureRef.current?.getBoundingClientRect().width || 0,
      );

      setOverflowTriggerWidth((prev) =>
        prev === nextOverflowTriggerWidth ? prev : nextOverflowTriggerWidth,
      );

      const nextSeparatorWidth = Math.ceil(
        separatorMeasureRef.current?.getBoundingClientRect().width || 0,
      );

      setSeparatorWidth((prev) =>
        prev === nextSeparatorWidth ? prev : nextSeparatorWidth,
      );
    };

    updateMeasurements();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateMeasurements);
      return () => window.removeEventListener("resize", updateMeasurements);
    }

    const resizeObserver = new ResizeObserver(updateMeasurements);

    enabledGroupKeys.forEach((groupKey) => {
      const element = groupMeasureRefs.current[groupKey];
      if (element) {
        resizeObserver.observe(element);
      }
    });

    if (overflowTriggerMeasureRef.current) {
      resizeObserver.observe(overflowTriggerMeasureRef.current);
    }

    if (separatorMeasureRef.current) {
      resizeObserver.observe(separatorMeasureRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [
    aiMenuMode,
    aiModeLabel,
    compactAi,
    effectiveSize,
    enabledGroupKeys,
    iconSize,
    onInsertImage,
    onToggleAiMenu,
  ]);

  const directGroupKeys = useMemo(() => {
    if (toolbarWidth === 0) return enabledGroupKeys;

    const resolvedSeparatorWidth = separatorWidth || SEPARATOR_RESERVED_WIDTH;
    const resolvedOverflowTriggerWidth =
      overflowTriggerWidth || OVERFLOW_RESERVED_WIDTH;
    const getGroupWidth = (groupKey: ToolbarGroupKey) =>
      groupWidths[groupKey] || TOOLBAR_GROUP_WIDTHS[groupKey][effectiveSize];

    const totalWidth = enabledGroupKeys.reduce((total, groupKey, index) => {
      return (
        total +
        getGroupWidth(groupKey) +
        (index > 0 ? resolvedSeparatorWidth : 0)
      );
    }, 0);

    if (totalWidth <= toolbarWidth) return enabledGroupKeys;

    const availableWidth = Math.max(
      toolbarWidth - resolvedOverflowTriggerWidth - resolvedSeparatorWidth,
      0,
    );
    const selectedGroups = new Set<ToolbarGroupKey>();
    let usedWidth = 0;

    for (const groupKey of TOOLBAR_GROUP_PRIORITY) {
      if (!enabledGroupKeys.includes(groupKey)) continue;

      const groupWidth =
        getGroupWidth(groupKey) +
        (selectedGroups.size > 0 ? resolvedSeparatorWidth : 0);

      if (usedWidth + groupWidth <= availableWidth) {
        selectedGroups.add(groupKey);
        usedWidth += groupWidth;
      }
    }

    return enabledGroupKeys.filter((groupKey) => selectedGroups.has(groupKey));
  }, [
    effectiveSize,
    enabledGroupKeys,
    groupWidths,
    overflowTriggerWidth,
    separatorWidth,
    toolbarWidth,
  ]);

  const overflowGroupKeys = useMemo(() => {
    const directGroups = new Set(directGroupKeys);
    return enabledGroupKeys.filter((groupKey) => !directGroups.has(groupKey));
  }, [directGroupKeys, enabledGroupKeys]);

  const openLinkDialog = useCallback(() => {
    const previousUrl = editor?.getAttributes("link").href || "";
    setLinkUrl(previousUrl);
    setLinkDialogOpen(true);
  }, [editor]);

  const handleLinkSubmit = useCallback(() => {
    if (!editor) return;

    // empty - remove link
    if (linkUrl === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      // update/set link
      try {
        editor
          .chain()
          .focus()
          .extendMarkRange("link")
          .setLink({ href: linkUrl })
          .run();
      } catch (e: any) {
        console.error("Failed to set link:", e.message);
      }
    }
    setLinkDialogOpen(false);
    setLinkUrl("");
  }, [editor, linkUrl]);

  const handleRemoveLink = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkDialogOpen(false);
    setLinkUrl("");
  }, [editor]);

  const openMathDialog = useCallback((type: "inline" | "block") => {
    setMathDialogType(type);
    setMathLatex("");
    setMathDialogOpen(true);
  }, []);

  const handleMathSubmit = useCallback(() => {
    if (!editor || !mathLatex.trim()) {
      setMathDialogOpen(false);
      return;
    }

    if (mathDialogType === "inline") {
      editor.chain().focus().insertInlineMath({ latex: mathLatex }).run();
    } else {
      editor.chain().focus().insertBlockMath({ latex: mathLatex }).run();
    }

    setMathDialogOpen(false);
    setMathLatex("");
  }, [editor, mathLatex, mathDialogType]);

  // Highlight color handlers
  const handleHighlightColor = useCallback(
    (color: string) => {
      if (!editor) return;
      editor.chain().focus().toggleHighlight({ color }).run();
      setHighlightPickerOpen(false);
    },
    [editor],
  );

  const handleRemoveHighlight = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().unsetHighlight().run();
    setHighlightPickerOpen(false);
  }, [editor]);

  // Text color handlers
  const handleTextColor = useCallback(
    (color: string) => {
      if (!editor) return;
      editor.chain().focus().setColor(color).run();
      setTextColorPickerOpen(false);
    },
    [editor],
  );

  const handleRemoveTextColor = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().unsetColor().run();
    setTextColorPickerOpen(false);
  }, [editor]);

  const handleCopyMarkdown = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      toast.error(t("editor.copyFailed"));
      return;
    }

    try {
      await navigator.clipboard.writeText(editor.getMarkdown());
      toast.success(t("editor.copiedMarkdown"));
    } catch (error) {
      console.error("Failed to copy note markdown:", error);
      toast.error(t("editor.copyFailed"));
    }
  }, [editor, t]);

  const overflowTriggerButtonClassName = cn(
    effectiveSize === "sm" ? "p-1" : "p-2",
    "rounded-md transition-colors hover:bg-accent hover:text-accent-foreground",
  );

  const renderColorPickerPortal = useCallback(
    (
      anchorElement: HTMLDivElement | null,
      picker: React.ReactNode,
      options?: { inline?: boolean },
    ): React.ReactNode => {
      if (!anchorElement) return null;

      if (options?.inline) {
        return picker;
      }

      const anchorRect = anchorElement.getBoundingClientRect();

      return createPortal(
        <div
          className="fixed z-50"
          style={{
            top: anchorRect.bottom + 4,
            left: anchorRect.left,
          }}
        >
          {picker}
        </div>,
        document.body,
      );
    },
    [],
  );

  const renderToolbarGroup = useCallback(
    (
      groupKey: ToolbarGroupKey,
      options?: {
        overflow?: boolean;
        showSeparator?: boolean;
        measure?: boolean;
      },
    ) => {
      const showDirectSeparator = options?.showSeparator ? (
        <div className={separatorClass} />
      ) : null;
      const shouldShowAiLabel = !compactAi && !options?.overflow;
      const shouldRenderInteractivePopovers = !options?.measure;

      switch (groupKey) {
        case "history":
          return (
            <div
              key={groupKey}
              ref={
                options?.measure
                  ? (node) => {
                      groupMeasureRefs.current[groupKey] = node;
                    }
                  : undefined
              }
              className="flex shrink-0 items-center gap-1"
              aria-hidden={options?.measure || undefined}
            >
              {showDirectSeparator}
              <ToolbarButton
                onClick={() => editor.chain().focus().undo().run()}
                disabled={!toolbarState.canUndo}
                tooltip={t("editor.undo")}
                size={effectiveSize}
              >
                <Undo size={iconSize} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().redo().run()}
                disabled={!toolbarState.canRedo}
                tooltip={t("editor.redo")}
                size={effectiveSize}
              >
                <Redo size={iconSize} />
              </ToolbarButton>
            </div>
          );
        case "headings":
          return (
            <div
              key={groupKey}
              ref={
                options?.measure
                  ? (node) => {
                      groupMeasureRefs.current[groupKey] = node;
                    }
                  : undefined
              }
              className="flex shrink-0 items-center gap-1"
              aria-hidden={options?.measure || undefined}
            >
              {showDirectSeparator}
              <ToolbarButton
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 1 }).run()
                }
                isActive={toolbarState.isHeading1Active}
                tooltip={t("editor.heading1")}
                size={effectiveSize}
              >
                <Heading1 size={iconSize} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 2 }).run()
                }
                isActive={toolbarState.isHeading2Active}
                tooltip={t("editor.heading2")}
                size={effectiveSize}
              >
                <Heading2 size={iconSize} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 3 }).run()
                }
                isActive={toolbarState.isHeading3Active}
                tooltip={t("editor.heading3")}
                size={effectiveSize}
              >
                <Heading3 size={iconSize} />
              </ToolbarButton>
            </div>
          );
        case "formatting":
          return (
            <div
              key={groupKey}
              ref={
                options?.measure
                  ? (node) => {
                      groupMeasureRefs.current[groupKey] = node;
                    }
                  : undefined
              }
              className="flex shrink-0 items-center gap-1"
              aria-hidden={options?.measure || undefined}
            >
              {showDirectSeparator}
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBold().run()}
                isActive={toolbarState.isBoldActive}
                tooltip={t("editor.bold")}
                size={effectiveSize}
              >
                <Bold size={iconSize} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleItalic().run()}
                isActive={toolbarState.isItalicActive}
                tooltip={t("editor.italic")}
                size={effectiveSize}
              >
                <Italic size={iconSize} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                isActive={toolbarState.isUnderlineActive}
                tooltip={t("editor.underline")}
                size={effectiveSize}
              >
                <UnderlineIcon size={iconSize} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleStrike().run()}
                isActive={toolbarState.isStrikeActive}
                tooltip={t("editor.strikethrough")}
                size={effectiveSize}
              >
                <Strikethrough size={iconSize} />
              </ToolbarButton>

              <div
                ref={
                  options?.measure
                    ? undefined
                    : (node) => {
                        highlightPickerAnchorRef.current = node;
                      }
                }
                className="relative"
              >
                <ToolbarButton
                  onClick={() => {
                    setTextColorPickerOpen(false);
                    setHighlightPickerOpen(!highlightPickerOpen);
                  }}
                  isActive={toolbarState.isHighlightActive}
                  tooltip={t("editor.highlight")}
                  size={effectiveSize}
                  activeColor={toolbarState.highlightColor}
                >
                  <Highlighter
                    size={iconSize}
                    style={{
                      borderBottom: `2px solid ${
                        toolbarState.highlightColor || "#fef08a"
                      }`,
                    }}
                  />
                </ToolbarButton>
                {shouldRenderInteractivePopovers &&
                  highlightPickerOpen &&
                  renderColorPickerPortal(
                    highlightPickerAnchorRef.current,
                    <ColorPicker
                      colors={HIGHLIGHT_COLORS}
                      activeColor={toolbarState.highlightColor ?? undefined}
                      onSelectColor={handleHighlightColor}
                      onRemoveColor={handleRemoveHighlight}
                      onClose={() => setHighlightPickerOpen(false)}
                    />,
                    { inline: options?.overflow },
                  )}
              </div>

              <div
                ref={
                  options?.measure
                    ? undefined
                    : (node) => {
                        textColorPickerAnchorRef.current = node;
                      }
                }
                className="relative"
              >
                <ToolbarButton
                  onClick={() => {
                    setHighlightPickerOpen(false);
                    setTextColorPickerOpen(!textColorPickerOpen);
                  }}
                  isActive={toolbarState.isTextStyleActive}
                  tooltip={t("editor.textColor")}
                  size={effectiveSize}
                  activeColor={toolbarState.textColor}
                >
                  <ALargeSmall
                    size={iconSize}
                    style={{
                      borderBottom: `2px solid ${
                        toolbarState.textColor || "currentColor"
                      }`,
                    }}
                  />
                </ToolbarButton>
                {shouldRenderInteractivePopovers &&
                  textColorPickerOpen &&
                  renderColorPickerPortal(
                    textColorPickerAnchorRef.current,
                    <ColorPicker
                      colors={TEXT_COLORS}
                      activeColor={toolbarState.textColor ?? undefined}
                      onSelectColor={handleTextColor}
                      onRemoveColor={handleRemoveTextColor}
                      onClose={() => setTextColorPickerOpen(false)}
                    />,
                    { inline: options?.overflow },
                  )}
              </div>
            </div>
          );
        case "lists":
          return (
            <div
              key={groupKey}
              ref={
                options?.measure
                  ? (node) => {
                      groupMeasureRefs.current[groupKey] = node;
                    }
                  : undefined
              }
              className="flex shrink-0 items-center gap-1"
              aria-hidden={options?.measure || undefined}
            >
              {showDirectSeparator}
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                isActive={toolbarState.isBulletListActive}
                tooltip={t("editor.bulletList")}
                size={effectiveSize}
              >
                <List size={iconSize} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                isActive={toolbarState.isOrderedListActive}
                tooltip={t("editor.orderedList")}
                size={effectiveSize}
              >
                <ListOrdered size={iconSize} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleTaskList().run()}
                isActive={toolbarState.isTaskListActive}
                tooltip={t("editor.taskList")}
                size={effectiveSize}
              >
                <CheckSquare size={iconSize} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() =>
                  editor.chain().focus().sinkListItem("listItem").run()
                }
                disabled={!toolbarState.canSinkListItem}
                tooltip={t("editor.indent")}
                size={effectiveSize}
              >
                <Indent size={iconSize} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() =>
                  editor.chain().focus().liftListItem("listItem").run()
                }
                disabled={!toolbarState.canLiftListItem}
                tooltip={t("editor.outdent")}
                size={effectiveSize}
              >
                <Outdent size={iconSize} />
              </ToolbarButton>
            </div>
          );
        case "block":
          return (
            <div
              key={groupKey}
              ref={
                options?.measure
                  ? (node) => {
                      groupMeasureRefs.current[groupKey] = node;
                    }
                  : undefined
              }
              className="flex shrink-0 items-center gap-1"
              aria-hidden={options?.measure || undefined}
            >
              {showDirectSeparator}
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                isActive={toolbarState.isBlockquoteActive}
                tooltip={t("editor.quote")}
                size={effectiveSize}
              >
                <Quote size={iconSize} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleCode().run()}
                isActive={toolbarState.isCodeActive}
                tooltip={t("editor.inlineCode")}
                size={effectiveSize}
              >
                <Code size={iconSize} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                isActive={toolbarState.isCodeBlockActive}
                tooltip={t("editor.codeBlock")}
                size={effectiveSize}
              >
                <SquareCode size={iconSize} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().setHorizontalRule().run()}
                tooltip={t("editor.horizontalRule")}
                size={effectiveSize}
              >
                <Minus size={iconSize} />
              </ToolbarButton>
            </div>
          );
        case "insert":
          return (
            <div
              key={groupKey}
              ref={
                options?.measure
                  ? (node) => {
                      groupMeasureRefs.current[groupKey] = node;
                    }
                  : undefined
              }
              className="flex shrink-0 items-center gap-1"
              aria-hidden={options?.measure || undefined}
            >
              {showDirectSeparator}
              <ToolbarButton
                onClick={openLinkDialog}
                isActive={toolbarState.isLinkActive}
                tooltip={t("editor.link")}
                size={effectiveSize}
              >
                <LinkIcon size={iconSize} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() =>
                  editor
                    .chain()
                    .focus()
                    .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                    .run()
                }
                tooltip={t("editor.insertTable")}
                size={effectiveSize}
              >
                <TableIcon size={iconSize} />
              </ToolbarButton>
              {onInsertImage && (
                <ToolbarButton
                  onClick={onInsertImage}
                  isActive={toolbarState.isImageActive}
                  tooltip={t("editor.image")}
                  size={effectiveSize}
                >
                  <ImageIcon size={iconSize} />
                </ToolbarButton>
              )}
              <ToolbarButton
                onClick={() => openMathDialog("inline")}
                isActive={toolbarState.isInlineMathActive}
                tooltip={t("editor.inlineMath")}
                size={effectiveSize}
              >
                <Pi size={iconSize} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => openMathDialog("block")}
                isActive={toolbarState.isBlockMathActive}
                tooltip={t("editor.blockMath")}
                size={effectiveSize}
              >
                <Sigma size={iconSize} />
              </ToolbarButton>
              <ToolbarButton
                onClick={handleInsertCalendar}
                tooltip={
                  isLicensed
                    ? t("editor.calendar.insert")
                    : t("proFeatures.licenseGate.featureTooltip", {
                        feature: t("editor.calendar.blockLabel"),
                      })
                }
                size={effectiveSize}
                variant="pro"
              >
                <CalendarDays size={iconSize} />
              </ToolbarButton>
              <ToolbarButton
                onClick={handleInsertKanban}
                tooltip={
                  isLicensed
                    ? t("editor.kanban.insert")
                    : t("proFeatures.licenseGate.featureTooltip", {
                        feature: t("editor.kanban.blockLabel"),
                      })
                }
                size={effectiveSize}
                variant="pro"
              >
                <SquareKanban size={iconSize} />
              </ToolbarButton>
            </div>
          );
        case "tools":
          return (
            <div
              key={groupKey}
              ref={
                options?.measure
                  ? (node) => {
                      groupMeasureRefs.current[groupKey] = node;
                    }
                  : undefined
              }
              className="flex shrink-0 items-center gap-1"
              aria-hidden={options?.measure || undefined}
            >
              {showDirectSeparator}
              <ToolbarButton
                onClick={handleCopyMarkdown}
                tooltip={t("editor.copyMarkdown")}
                size={effectiveSize}
              >
                <Clipboard size={iconSize} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() =>
                  setTimeout(() => {
                    editor
                      .chain()
                      .focus()
                      .insertMermaid("graph TD\n    A[Start] --> B[End]")
                      .run();
                  }, 0)
                }
                tooltip={t("editor.mermaid.insert")}
                size={effectiveSize}
              >
                <Workflow size={iconSize} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() =>
                  setTimeout(() => {
                    editor.chain().focus().insertExcalidraw().run();
                  }, 0)
                }
                tooltip={t("editor.excalidraw.insert")}
                size={effectiveSize}
              >
                <PenLine size={iconSize} />
              </ToolbarButton>

              {onToggleAiMenu && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        onToggleAiMenu();
                      }}
                      aria-pressed={aiMenuMode !== "off"}
                      className={cn(
                        effectiveSize === "sm" ? "px-2 py-1" : "px-3 py-2",
                        "inline-flex items-center gap-2 rounded-md border transition-all",
                        aiMenuMode === "off" &&
                          "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                        aiMenuMode === "selection" &&
                          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300",
                        aiMenuMode === "askAi" &&
                          "border-sky-500/30 bg-sky-500/10 text-sky-700 hover:bg-sky-500/15 dark:text-sky-300",
                      )}
                    >
                      <Sparkles
                        size={iconSize}
                        className={cn(
                          "shrink-0",
                          aiMenuMode !== "off" &&
                            "animate-[sparkle_1.2s_ease-in-out_infinite]",
                        )}
                      />
                      {shouldShowAiLabel && (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] leading-none font-semibold tracking-[0.14em] uppercase",
                            aiMenuMode === "off" &&
                              "bg-muted text-muted-foreground",
                            aiMenuMode === "selection" &&
                              "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
                            aiMenuMode === "askAi" &&
                              "bg-sky-500/15 text-sky-800 dark:text-sky-200",
                          )}
                        >
                          {aiModeLabel}
                        </span>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">{aiModeTooltip}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          );
      }
    },
    [
      aiMenuMode,
      aiModeLabel,
      aiModeTooltip,
      compactAi,
      effectiveSize,
      editor,
      handleHighlightColor,
      handleRemoveHighlight,
      handleRemoveTextColor,
      handleCopyMarkdown,
      handleTextColor,
      highlightPickerOpen,
      iconSize,
      onInsertImage,
      onToggleAiMenu,
      openLinkDialog,
      openMathDialog,
      renderColorPickerPortal,
      separatorClass,
      t,
      textColorPickerOpen,
      toolbarState,
    ],
  );

  if (!editor) return null;

  return (
    <div
      ref={toolbarRef}
      className="relative flex min-h-10 flex-nowrap items-center justify-center overflow-hidden border-b border-border bg-muted/30 px-1"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-[-1] flex h-0 overflow-hidden opacity-0"
      >
        <div ref={separatorMeasureRef} className={separatorClass} />
        {enabledGroupKeys.map((groupKey) =>
          renderToolbarGroup(groupKey, { measure: true }),
        )}
        <button
          ref={overflowTriggerMeasureRef}
          type="button"
          className={overflowTriggerButtonClassName}
          tabIndex={-1}
        >
          <MoreHorizontal size={iconSize} />
        </button>
      </div>

      {directGroupKeys.map((groupKey, index) =>
        renderToolbarGroup(groupKey, { showSeparator: index > 0 }),
      )}

      {overflowGroupKeys.length > 0 && (
        <>
          {directGroupKeys.length > 0 && <div className={separatorClass} />}
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={t("editor.moreActions")}
                    className={overflowTriggerButtonClassName}
                  >
                    <MoreHorizontal size={iconSize} />
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">{t("editor.moreActions")}</p>
              </TooltipContent>
            </Tooltip>
            <PopoverContent
              align="end"
              sideOffset={8}
              className="w-auto max-w-[min(28rem,calc(100vw-1rem))] p-2"
            >
              <div className="flex flex-col gap-2">
                {overflowGroupKeys.map((groupKey) => (
                  <div key={groupKey} className="flex flex-col gap-1">
                    <div className="px-1 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                      {t(`settings.editor.toolbar.${groupKey}.title`)}
                    </div>
                    <div className="flex flex-wrap items-center gap-1 rounded-lg bg-muted/40 p-1">
                      {renderToolbarGroup(groupKey, { overflow: true })}
                    </div>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </>
      )}

      {/* Link Modal */}
      {linkDialogOpen &&
        createPortal(
          <div className="fixed inset-0 z-60 flex animate-in items-center justify-center bg-black/50 p-4 backdrop-blur-sm duration-200 fade-in">
            <div
              className="flex w-full max-w-md animate-in flex-col overflow-hidden rounded-2xl bg-card shadow-2xl duration-200 zoom-in-95"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
                <h3 className="text-lg font-semibold text-foreground">
                  {t("editor.insertLink")}
                </h3>
                <button
                  type="button"
                  onClick={() => setLinkDialogOpen(false)}
                  className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex flex-col gap-4 p-4">
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleLinkSubmit();
                    }
                  }}
                  className="w-full rounded-xl border-none bg-muted px-4 py-3 text-sm transition-all outline-none focus:ring-2 focus:ring-accent"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-border p-4">
                {toolbarState.isLinkActive && (
                  <button
                    type="button"
                    onClick={handleRemoveLink}
                    className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    {t("editor.removeLink")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setLinkDialogOpen(false)}
                  className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleLinkSubmit}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {t("common.save")}
                </button>
              </div>
            </div>
            <div
              className="absolute inset-0 -z-10"
              onClick={() => setLinkDialogOpen(false)}
            />
          </div>,
          document.body,
        )}

      {/* Math Modal */}
      {mathDialogOpen &&
        createPortal(
          <div className="fixed inset-0 z-60 flex animate-in items-center justify-center bg-black/50 p-4 backdrop-blur-sm duration-200 fade-in">
            <div
              className="flex w-full max-w-md animate-in flex-col overflow-hidden rounded-2xl bg-card shadow-2xl duration-200 zoom-in-95"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
                <h3 className="text-lg font-semibold text-foreground">
                  {mathDialogType === "inline"
                    ? t("editor.inlineMath")
                    : t("editor.blockMath")}
                </h3>
                <button
                  type="button"
                  onClick={() => setMathDialogOpen(false)}
                  className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex flex-col gap-4 p-4">
                <label
                  htmlFor="math-latex-input"
                  className="text-sm text-muted-foreground"
                >
                  {t("editor.enterLatex")}
                </label>
                <input
                  id="math-latex-input"
                  type="text"
                  placeholder="E = mc^2"
                  value={mathLatex}
                  onChange={(e) => setMathLatex(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleMathSubmit();
                    }
                  }}
                  className="w-full rounded-xl border-none bg-muted px-4 py-3 font-mono text-sm transition-all outline-none focus:ring-2 focus:ring-accent"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-border p-4">
                <button
                  type="button"
                  onClick={() => setMathDialogOpen(false)}
                  className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleMathSubmit}
                  disabled={!mathLatex.trim()}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {t("common.save")}
                </button>
              </div>
            </div>
            <div
              className="absolute inset-0 -z-10"
              onClick={() => setMathDialogOpen(false)}
            />
          </div>,
          document.body,
        )}
    </div>
  );
};
