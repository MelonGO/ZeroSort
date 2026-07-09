import type { TFunction } from "i18next";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { useEditorSelection } from "@/hooks/useEditorSelection";
import { useMouseDown } from "@/hooks/useMouseDown";
import { useNoModelSelectedToast } from "@/hooks/useNoModelSelectedToast";
import { type AiActionType, buildPrompt } from "@/lib/ai/prompts";
import { getModelFromConfig } from "@/lib/ai/provider";
import { parseChartConfig } from "@/lib/visualization/chartjs";
import { transformer } from "@/lib/visualization/markmap";
import { useStore } from "@/store/useStore";

import {
  autoUpdate,
  flip,
  inline,
  offset,
  shift,
  size,
  useFloating,
} from "@floating-ui/react";
import { isTextSelection } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import { streamText } from "ai";
import { Markmap } from "markmap-view";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAiFloatingMenu(
  editor: Editor,
  isEnabled: boolean,
  t: TFunction,
) {
  const showNoModelSelectedToast = useNoModelSelectedToast();
  // --- State ---
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamedText, setStreamedText] = useState("");
  const [generatedText, setGeneratedText] = useState("");
  const [activeSubmenu, setActiveSubmenu] = useState<
    "languages" | "tones" | "chartTypes" | null
  >(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [useFullContext, setUseFullContext] = useState(false);
  const [markmapContent, setMarkmapContent] = useState<string | null>(null);
  const [chartContent, setChartContent] = useState<string | null>(null);
  const [mermaidContent, setMermaidContent] = useState<string | null>(null);
  const [isInsertMode, setIsInsertMode] = useState(false);
  const [pendingInsert, setPendingInsert] = useState<{
    contentType: "text" | "markmap" | "chart" | "mermaid";
    content: string;
  } | null>(null);

  // --- Store ---
  const modelConfigs = useStore((state) => state.modelConfigs);
  const activeConfigId = useStore((state) => state.activeConfigId);
  const selectedModelId = useStore((state) => state.selectedModelId);

  // --- Refs ---
  const abortControllerRef = useRef<AbortController | null>(null);
  const submenuCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const markmapSvgRef = useRef<SVGSVGElement>(null);
  const markmapInstanceRef = useRef<Markmap | null>(null);

  // --- External subscriptions ---
  const selectionState = useEditorSelection(editor);
  const isMouseDown = useMouseDown(editor.view.dom);

  // --- Visibility ---
  const isVisible = useMemo(() => {
    if (!isEnabled) return false;
    if (isInsertMode) return true;
    if (
      isLoading ||
      generatedText ||
      streamedText ||
      markmapContent ||
      chartContent ||
      mermaidContent
    )
      return true;
    if (isMouseDown) return false;

    const hasTextSelection =
      !selectionState.empty &&
      selectionState.from !== selectionState.to &&
      isTextSelection(editor.state.selection);
    return editor.view.hasFocus() && hasTextSelection;
  }, [
    isEnabled,
    isInsertMode,
    isLoading,
    generatedText,
    streamedText,
    markmapContent,
    chartContent,
    mermaidContent,
    isMouseDown,
    selectionState,
    editor.view,
  ]);

  // --- Floating UI positioning ---
  const virtualElement = useMemo(() => {
    return {
      contextElement: editor.view.dom,
      getBoundingClientRect: () => {
        const start = editor.view.coordsAtPos(selectionState.from);
        const end = editor.view.coordsAtPos(selectionState.to);
        return {
          x: start.left,
          y: start.top,
          top: start.top,
          left: start.left,
          right: end.right,
          bottom: end.bottom,
          width: end.right - start.left,
          height: end.bottom - start.top,
        };
      },
      getClientRects: () => {
        const start = editor.view.coordsAtPos(selectionState.from);
        const end = editor.view.coordsAtPos(selectionState.to);
        const rect = {
          x: start.left,
          y: start.top,
          top: start.top,
          left: start.left,
          right: end.right,
          bottom: end.bottom,
          width: end.right - start.left,
          height: end.bottom - start.top,
        };
        return [rect] as unknown as DOMRectList;
      },
    };
  }, [selectionState, editor.view]);

  const { refs, floatingStyles } = useFloating({
    open: isVisible,
    placement: "bottom-start",
    middleware: [
      inline(),
      offset(8),
      size({
        padding: 8,
        apply({ availableHeight, elements }) {
          Object.assign(elements.floating.style, {
            maxHeight: `${Math.max(400, availableHeight)}px`,
          });
        },
      }),
      flip({
        fallbackPlacements: ["top-start", "top-end", "bottom-end"],
        fallbackStrategy: "initialPlacement",
      }),
      shift({ padding: 8 }),
    ],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    refs.setReference(virtualElement);
  }, [virtualElement, refs]);

  // Collapse to the trigger button when selection context changes.
  useEffect(() => {
    setIsExpanded(false);
  }, [selectionState.from, selectionState.to]);

  useEffect(() => {
    if (isMouseDown || !isVisible) {
      setIsExpanded(false);
    }
  }, [isMouseDown, isVisible]);

  // --- Markmap rendering lifecycle ---
  useEffect(() => {
    if (!markmapContent) {
      if (markmapInstanceRef.current) {
        markmapInstanceRef.current.destroy();
        markmapInstanceRef.current = null;
      }
      return;
    }
    if (!markmapSvgRef.current) return;

    if (!markmapInstanceRef.current) {
      markmapInstanceRef.current = Markmap.create(markmapSvgRef.current);
    }

    const mm = markmapInstanceRef.current;
    const { root } = transformer.transform(markmapContent);
    mm.setData(root).then(() => mm.fit());
  }, [markmapContent]);

  // --- Submenu timeout cleanup ---
  useEffect(() => {
    return () => {
      if (submenuCloseTimeoutRef.current) {
        clearTimeout(submenuCloseTimeoutRef.current);
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleDiscard = useCallback(() => {
    setGeneratedText("");
    setSelectionEnd(null);
    setMarkmapContent(null);
    setChartContent(null);
    setMermaidContent(null);
    setIsInsertMode(false);
    setPendingInsert(null);
  }, []);

  const handleInterrupt = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const handleCopy = useCallback(async () => {
    const content =
      generatedText || markmapContent || mermaidContent || chartContent;

    if (!content || !navigator?.clipboard) {
      toast.error(t("editor.copyFailed"));
      return;
    }

    try {
      await navigator.clipboard.writeText(content);
      toast.success(t("aiMenu.copied"));
    } catch (error) {
      console.error("Failed to copy AI content:", error);
      toast.error(t("editor.copyFailed"));
    }
  }, [chartContent, generatedText, markmapContent, mermaidContent, t]);

  const handleInsert = useCallback(
    (
      contentType: "text" | "markmap" | "chart" | "mermaid",
      content: string,
      endPos: number,
    ) => {
      let insertContent: Parameters<
        ReturnType<Editor["chain"]>["insertContentAt"]
      >[1];
      let successKey: string;

      switch (contentType) {
        case "markmap":
          insertContent = [
            { type: "paragraph" },
            { type: "markmap", attrs: { content } },
          ];
          successKey = "aiMenu.mindmapInserted";
          break;
        case "chart":
          insertContent = [
            { type: "paragraph" },
            { type: "chart", attrs: { config: content } },
          ];
          successKey = "aiMenu.chartInserted";
          break;
        case "mermaid":
          insertContent = [
            { type: "paragraph" },
            { type: "mermaidDiagram", attrs: { content } },
          ];
          successKey = "aiMenu.mermaidInserted";
          break;
        case "text":
        default:
          successKey = "aiMenu.success";
          break;
      }

      try {
        if (contentType === "text") {
          editor.chain().focus().setTextSelection(endPos).run();
          const result = editor.commands.insertContent(content, {
            contentType: "markdown",
          });

          if (!result) {
            throw new Error("text insertion failed");
          }
        } else {
          const result = editor
            .chain()
            .focus()
            .insertContentAt(endPos, insertContent!)
            .run();

          if (!result) {
            throw new Error(`${contentType} insertion failed`);
          }
        }
      } catch (error) {
        if (contentType === "text") {
          console.warn(
            "Markdown insertion failed, falling back to plain text:",
            error,
          );
          toast.warning(
            `Error parsing markdown: ${error instanceof Error ? error.message : String(error)}`,
          );
        } else {
          console.error(`Failed to insert ${contentType}:`, error);
          toast.error(t("aiMenu.errors.failed"));
          return;
        }
      }

      toast.success(t(successKey));
      setGeneratedText("");
      setSelectionEnd(null);
      setMarkmapContent(null);
      setChartContent(null);
      setMermaidContent(null);
    },
    [editor, t],
  );

  const enterInsertMode = useCallback(() => {
    const content =
      generatedText || markmapContent || chartContent || mermaidContent;
    if (!content) return;

    const contentType: "text" | "markmap" | "chart" | "mermaid" = markmapContent
      ? "markmap"
      : chartContent
        ? "chart"
        : mermaidContent
          ? "mermaid"
          : "text";

    setPendingInsert({ contentType, content });
    setIsInsertMode(true);
  }, [generatedText, markmapContent, chartContent, mermaidContent]);

  const cancelInsertMode = useCallback(() => {
    setIsInsertMode(false);
    setPendingInsert(null);
  }, []);

  const handleEditorClick = useCallback(
    (pos: number) => {
      if (!isInsertMode || !pendingInsert) return;

      handleInsert(pendingInsert.contentType, pendingInsert.content, pos);
      setIsInsertMode(false);
      setPendingInsert(null);
    },
    [isInsertMode, pendingInsert, handleInsert],
  );

  const handleAiAction = useCallback(
    async (actionType: AiActionType, option?: string) => {
      const { from, to } = editor.state.selection;
      const selectedText = editor.state.doc.textBetween(from, to, " ");

      if (!selectedText.trim()) {
        toast.error(t("aiMenu.errors.noSelection"));
        return;
      }

      const activeConfig = modelConfigs.find((c) => c.id === activeConfigId);
      if (!activeConfig || !selectedModelId) {
        showNoModelSelectedToast();
        return;
      }

      const isMindmap = actionType === "mindmap";
      const isChart = actionType === "chart";
      const isMermaid = actionType === "mermaid";
      const fullDocumentContext = useFullContext
        ? editor.getMarkdown()
        : undefined;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const systemPrompt = buildPrompt(
        actionType,
        selectedText,
        t,
        option,
        fullDocumentContext,
      );

      setIsLoading(true);
      setStreamedText("");
      setActiveSubmenu(null);
      setSelectionEnd(to);

      if (isMindmap) setMarkmapContent("");
      if (isChart) setChartContent("");
      if (isMermaid) setMermaidContent("");

      let fullText = "";
      try {
        console.log("System prompt:", systemPrompt);

        const result = streamText({
          model: await getModelFromConfig(activeConfig, selectedModelId),
          prompt: systemPrompt,
          abortSignal: abortControllerRef.current.signal,
        });

        for await (const chunk of result.textStream) {
          fullText += chunk;
          if (isMindmap) {
            const content = fullText;
            startTransition(() => {
              setMarkmapContent(content);
            });
          } else if (isMermaid) {
            const content = fullText;
            startTransition(() => {
              setMermaidContent(content);
            });
          } else {
            setStreamedText(fullText);
          }
        }

        if (!fullText.trim()) {
          toast.error(t("aiMenu.errors.emptyResponse"));
          setSelectionEnd(null);
          if (isMindmap) setMarkmapContent(null);
          if (isChart) setChartContent(null);
          if (isMermaid) setMermaidContent(null);
          return;
        }

        if (isMindmap) {
          setMarkmapContent(fullText);
        } else if (isMermaid) {
          setMermaidContent(fullText);
        } else if (isChart) {
          const parsed = parseChartConfig(fullText);
          if (parsed) {
            setChartContent(fullText);
          } else {
            toast.error(t("aiMenu.chartParseError"));
            setChartContent(null);
            setSelectionEnd(null);
          }
        } else {
          setGeneratedText(fullText);
        }
      } catch (error: any) {
        if (error.name === "AbortError") {
          if (!fullText.trim()) {
            setSelectionEnd(null);
            if (isMindmap) setMarkmapContent(null);
            if (isChart) setChartContent(null);
            if (isMermaid) setMermaidContent(null);
            return;
          }
          if (isChart) {
            const parsed = parseChartConfig(fullText);
            if (parsed) {
              setChartContent(fullText);
            } else {
              setChartContent(null);
              setSelectionEnd(null);
            }
          } else if (!isMindmap && !isMermaid) {
            setGeneratedText(fullText);
          }
          return;
        }

        console.error("AI action failed:", error);
        toast.error(t("aiMenu.errors.failed"));
        setSelectionEnd(null);
        if (isMindmap) setMarkmapContent(null);
        if (isChart) setChartContent(null);
        if (isMermaid) setMermaidContent(null);
      } finally {
        setIsLoading(false);
        setStreamedText("");
        setPrompt("");
      }
    },
    [
      activeConfigId,
      editor,
      modelConfigs,
      selectedModelId,
      showNoModelSelectedToast,
      t,
      useFullContext,
    ],
  );

  const handleCustomPrompt = useCallback(() => {
    if (prompt.trim()) {
      handleAiAction("custom", prompt);
    }
  }, [prompt, handleAiAction]);

  const handleSubmenuMouseEnter = useCallback(
    (submenuType: "languages" | "tones" | "chartTypes" | undefined) => {
      if (submenuCloseTimeoutRef.current) {
        clearTimeout(submenuCloseTimeoutRef.current);
        submenuCloseTimeoutRef.current = null;
      }
      setActiveSubmenu(submenuType || null);
    },
    [],
  );

  const handleSubmenuMouseLeave = useCallback(() => {
    if (submenuCloseTimeoutRef.current) {
      clearTimeout(submenuCloseTimeoutRef.current);
    }
    submenuCloseTimeoutRef.current = setTimeout(() => {
      setActiveSubmenu(null);
      submenuCloseTimeoutRef.current = null;
    }, 300);
  }, []);

  const handleMenuMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable
    ) {
      return;
    }
    e.preventDefault();
  }, []);

  const handleExpandMenu = useCallback(() => {
    setIsExpanded(true);
  }, []);

  return {
    // State
    isVisible,
    isExpanded,
    isLoading,
    isInsertMode,
    prompt,
    setPrompt,
    generatedText,
    streamedText,
    activeSubmenu,
    useFullContext,
    setUseFullContext,
    markmapContent,
    chartContent,
    mermaidContent,

    // Refs
    refs,
    floatingStyles,
    markmapSvgRef,

    // Handlers
    handleAiAction,
    handleDiscard,
    handleCopy,
    handleInterrupt,
    enterInsertMode,
    cancelInsertMode,
    handleEditorClick,
    handleCustomPrompt,
    handleSubmenuMouseEnter,
    handleSubmenuMouseLeave,
    handleMenuMouseDown,
    handleExpandMenu,
  };
}
