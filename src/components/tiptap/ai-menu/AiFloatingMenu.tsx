import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { Editor } from "@tiptap/react";
import { MousePointerClick, Sparkles } from "lucide-react";

import { ActionPanel } from "./ActionPanel";
import { ChartPreview } from "./ChartPreview";
import { MarkmapPreview } from "./MarkmapPreview";
import { MermaidPreview } from "./MermaidPreview";
import { TextPreview } from "./TextPreview";
import { useAiFloatingMenu } from "./useAiFloatingMenu";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AiFloatingMenuProps {
  editor: Editor;
  isEnabled?: boolean;
  showModelSelect?: boolean;
}

// ---------------------------------------------------------------------------
// View readiness hook
// ---------------------------------------------------------------------------

/**
 * Tracks whether the Tiptap editor's ProseMirror view is mounted and
 * accessible. In Tiptap 3, accessing `editor.view` before the view is
 * created (or after destroy) throws, so dependent UI must wait.
 */
function useEditorViewReady(editor: Editor): boolean {
  const [ready, setReady] = useState(() => {
    try {
      return Boolean(editor.view?.dom);
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const checkReady = () => {
      try {
        if (editor.view?.dom) {
          setReady(true);
          return;
        }
      } catch {
        // view accessor throws when not mounted; fall through
      }
      setReady(false);
    };

    checkReady();

    const handleDestroy = () => setReady(false);
    editor.on("create", checkReady);
    editor.on("destroy", handleDestroy);

    return () => {
      editor.off("create", checkReady);
      editor.off("destroy", handleDestroy);
    };
  }, [editor]);

  return ready;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AiFloatingMenu: React.FC<AiFloatingMenuProps> = (props) => {
  const isViewReady = useEditorViewReady(props.editor);
  if (!isViewReady) return null;
  return <AiFloatingMenuInner {...props} />;
};

const AiFloatingMenuInner: React.FC<AiFloatingMenuProps> = ({
  editor,
  isEnabled = true,
  showModelSelect = false,
}) => {
  const { t } = useTranslation();

  const {
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
    refs,
    floatingStyles,
    markmapSvgRef,
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
  } = useAiFloatingMenu(editor, isEnabled, t);

  // Handle editor clicks for insert mode
  useEffect(() => {
    if (!isInsertMode) return;

    const handleClick = (event: MouseEvent) => {
      const pos = editor.view.posAtCoords({
        left: event.clientX,
        top: event.clientY,
      });
      if (pos) {
        editor.chain().focus().setTextSelection(pos.pos).run();
        handleEditorClick(pos.pos);
      }
    };

    editor.view.dom.classList.add("ask-ai-insert-mode");
    editor.view.dom.addEventListener("click", handleClick);

    return () => {
      editor.view.dom.classList.remove("ask-ai-insert-mode");
      editor.view.dom.removeEventListener("click", handleClick);
    };
  }, [isInsertMode, handleEditorClick, editor]);

  if (!isVisible) return null;

  // Insert mode overlay
  if (isInsertMode) {
    return createPortal(
      <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center">
        <div className="flex items-center gap-3 rounded-full border bg-popover px-4 py-2 shadow-lg">
          <MousePointerClick size={16} className="text-purple-500" />
          <span className="text-sm">{t("askAi.pickLocation")}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={cancelInsertMode}
          >
            {t("common.cancel")}
          </Button>
        </div>
      </div>,
      document.body,
    );
  }

  const hasGeneratedContent =
    markmapContent !== null ||
    mermaidContent !== null ||
    chartContent !== null ||
    Boolean(generatedText || streamedText);

  return createPortal(
    <div
      ref={refs.setFloating}
      style={floatingStyles}
      onMouseDown={handleMenuMouseDown}
      className={cn(
        "relative z-50 rounded-lg border bg-popover shadow-lg",
        hasGeneratedContent || isExpanded
          ? "flex w-[calc(100vw-2rem)] max-w-xl flex-col overflow-hidden"
          : "inline-flex overflow-visible",
      )}
    >
      {markmapContent !== null ? (
        <MarkmapPreview
          markmapSvgRef={markmapSvgRef}
          isLoading={isLoading}
          onDiscard={handleDiscard}
          onInsertAtPosition={enterInsertMode}
          onInterrupt={handleInterrupt}
        />
      ) : mermaidContent !== null ? (
        <MermaidPreview
          mermaidContent={mermaidContent}
          isLoading={isLoading}
          onDiscard={handleDiscard}
          onInsertAtPosition={enterInsertMode}
          onInterrupt={handleInterrupt}
        />
      ) : chartContent !== null ? (
        <ChartPreview
          chartContent={chartContent}
          isLoading={isLoading}
          onDiscard={handleDiscard}
          onInsertAtPosition={enterInsertMode}
          onInterrupt={handleInterrupt}
        />
      ) : generatedText || streamedText ? (
        <TextPreview
          generatedText={generatedText}
          streamedText={streamedText}
          isLoading={isLoading}
          onCopy={handleCopy}
          onDiscard={handleDiscard}
          onInsertAtPosition={enterInsertMode}
          onInterrupt={handleInterrupt}
        />
      ) : !isExpanded ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleExpandMenu}
          className="h-9 gap-1.5"
        >
          <Sparkles size={14} />
          {t("aiMenu.editWithAi")}
        </Button>
      ) : (
        <ActionPanel
          prompt={prompt}
          onPromptChange={setPrompt}
          onSubmit={handleCustomPrompt}
          isLoading={isLoading}
          useFullContext={useFullContext}
          onUseFullContextChange={setUseFullContext}
          showModelSelect={showModelSelect}
          activeSubmenu={activeSubmenu}
          onAiAction={handleAiAction}
          onSubmenuMouseEnter={handleSubmenuMouseEnter}
          onSubmenuMouseLeave={handleSubmenuMouseLeave}
          onInterrupt={handleInterrupt}
        />
      )}
    </div>,
    document.body,
  );
};
