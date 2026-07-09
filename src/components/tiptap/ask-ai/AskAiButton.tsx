import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { Editor } from "@tiptap/react";
import { MessageCircle } from "lucide-react";

import { AskAiPanel } from "./AskAiPanel";
import { useAskAi } from "./useAskAi";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AskAiButtonProps {
  editor: Editor;
  noteId?: string;
  showModelSelect?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AskAiButton({
  editor,
  noteId,
  showModelSelect = false,
}: AskAiButtonProps) {
  const { t } = useTranslation();
  const askAi = useAskAi(editor, noteId);

  // Handle editor clicks for insert mode
  useEffect(() => {
    if (!askAi.isInsertMode) return;

    const handleClick = (event: MouseEvent) => {
      const pos = editor.view.posAtCoords({
        left: event.clientX,
        top: event.clientY,
      });
      if (pos) {
        editor.chain().focus().setTextSelection(pos.pos).run();
        askAi.handleEditorClick(pos.pos);
      }
    };

    // Add class to editor container for visual insert mode indicator
    editor.view.dom.classList.add("ask-ai-insert-mode");
    editor.view.dom.addEventListener("click", handleClick);

    return () => {
      editor.view.dom.classList.remove("ask-ai-insert-mode");
      editor.view.dom.removeEventListener("click", handleClick);
    };
  }, [askAi.isInsertMode, askAi.handleEditorClick, editor]);

  return (
    <>
      {/* Floating button in bottom-right corner */}
      {!askAi.isOpen &&
        !askAi.isInsertMode &&
        createPortal(
          <div className="pointer-events-none fixed right-6 bottom-12 z-40">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="default"
                  size="icon"
                  className="pointer-events-auto h-10 w-10 rounded-full shadow-lg"
                  onClick={askAi.open}
                >
                  <MessageCircle size={18} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p className="text-xs">{t("askAi.title")}</p>
              </TooltipContent>
            </Tooltip>
          </div>,
          document.body,
        )}

      {/* Panel (portal to body) */}
      {(askAi.isOpen || askAi.isInsertMode) && (
        <AskAiPanel askAi={askAi} showModelSelect={showModelSelect} />
      )}
    </>
  );
}
