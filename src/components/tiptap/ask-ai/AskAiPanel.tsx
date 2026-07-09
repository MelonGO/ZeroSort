import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { ModelSelectDropdown } from "@/components/editor/ModelSelectDropdown";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  ArrowUp,
  Loader2,
  MousePointerClick,
  RotateCcw,
  Sparkles,
  Square,
  X,
} from "lucide-react";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import "katex/dist/katex.min.css";
import { Streamdown } from "streamdown";

import { NoteMentionPopover } from "./NoteMentionPopover";
import type { UseAskAiReturn } from "./useAskAi";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AskAiPanelProps {
  askAi: UseAskAiReturn;
  showModelSelect?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AskAiPanel: React.FC<AskAiPanelProps> = ({
  askAi,
  showModelSelect = false,
}) => {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showMentionPopover, setShowMentionPopover] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const mentionAnchorRef = useRef<number | null>(null);

  const {
    isOpen,
    prompt,
    setPrompt,
    referencedNotes,
    addReferencedNote,
    removeReferencedNote,
    messages,
    isLoading,
    isInsertMode,
    close,
    submit,
    interrupt,
    clearChat,
    enterInsertMode,
    cancelInsertMode,
  } = askAi;
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const selectedNoteIds = useMemo(
    () => new Set(referencedNotes.map((n) => n.id)),
    [referencedNotes],
  );

  // Auto-focus textarea on open
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isLoading) {
      return;
    }

    setShowMentionPopover(false);
    setMentionFilter("");
    mentionAnchorRef.current = null;
  }, [isLoading]);

  useEffect(() => {
    if (!transcriptRef.current) {
      return;
    }

    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [messages, isLoading]);

  // Handle @ mention detection in textarea
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setPrompt(value);

      const cursorPos = e.target.selectionStart ?? 0;
      // Check for @ mention
      const textUpToCursor = value.slice(0, cursorPos);
      const lastAtIndex = textUpToCursor.lastIndexOf("@");

      if (lastAtIndex !== -1) {
        const textAfterAt = textUpToCursor.slice(lastAtIndex + 1);
        // Only show popover if @ is at start or preceded by whitespace, and no space in filter
        const charBeforeAt = lastAtIndex > 0 ? value[lastAtIndex - 1] : " ";
        if (
          (charBeforeAt === " " ||
            charBeforeAt === "\n" ||
            lastAtIndex === 0) &&
          !textAfterAt.includes(" ")
        ) {
          setShowMentionPopover(true);
          setMentionFilter(textAfterAt);
          mentionAnchorRef.current = lastAtIndex;
          return;
        }
      }

      setShowMentionPopover(false);
      setMentionFilter("");
      mentionAnchorRef.current = null;
    },
    [setPrompt],
  );

  const handleMentionSelect = useCallback(
    (noteId: string, title: string) => {
      addReferencedNote({ id: noteId, title });

      // Remove the @filter text from prompt
      if (mentionAnchorRef.current !== null) {
        const before = prompt.slice(0, mentionAnchorRef.current);
        const cursorPos = textareaRef.current?.selectionStart ?? prompt.length;
        const after = prompt.slice(cursorPos);
        setPrompt(before + after);
      }

      setShowMentionPopover(false);
      setMentionFilter("");
      mentionAnchorRef.current = null;
      textareaRef.current?.focus();
    },
    [addReferencedNote, prompt, setPrompt],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!isLoading && prompt.trim()) {
          submit();
        }
      }
      if (e.key === "Escape") {
        if (showMentionPopover) {
          setShowMentionPopover(false);
        } else {
          close();
        }
      }
    },
    [isLoading, prompt, submit, close, showMentionPopover],
  );

  const hasMessages = messages.length > 0;

  if (!isOpen) return null;

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

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 bottom-12 z-50 flex justify-end px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className={cn(
          "pointer-events-auto flex w-full max-w-lg flex-col overflow-visible rounded-xl border bg-popover shadow-2xl",
          hasMessages ? "max-h-[70vh]" : "",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Sparkles size={14} className="text-purple-500" />
            {t("askAi.title")}
          </span>
          <div className="flex items-center gap-2">
            {hasMessages && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                disabled={isLoading}
                onClick={clearChat}
                title={t("askAi.newChat")}
              >
                <RotateCcw size={12} />
                {t("askAi.newChat")}
              </Button>
            )}
            {showModelSelect && <ModelSelectDropdown />}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="rounded-full text-muted-foreground"
              onClick={close}
            >
              <X size={14} />
            </Button>
          </div>
        </div>

        {/* Conversation area */}
        {hasMessages && (
          <div
            ref={transcriptRef}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto border-b p-4"
          >
            {messages.map((message) => {
              const isAssistant = message.role === "assistant";
              const canInsert =
                isAssistant &&
                message.status !== "streaming" &&
                message.status !== "error" &&
                Boolean(message.content.trim());

              return (
                <div
                  key={message.id}
                  className={cn(
                    "flex",
                    isAssistant ? "justify-start" : "justify-end",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[88%] rounded-lg px-3 py-2 text-sm",
                      isAssistant
                        ? "bg-background"
                        : "bg-primary text-primary-foreground",
                    )}
                  >
                    {message.status === "streaming" && !message.content && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2
                          size={12}
                          className="animate-spin text-purple-500"
                        />
                        {t("aiMenu.generating")}
                      </div>
                    )}
                    {message.status === "error" && !message.content && (
                      <div className="text-xs text-destructive">
                        {t("aiMenu.errors.failed")}
                      </div>
                    )}
                    {message.content &&
                      (isAssistant ? (
                        <Streamdown
                          plugins={{ code, math, cjk }}
                          isAnimating={message.status === "streaming"}
                        >
                          {message.content}
                        </Streamdown>
                      ) : (
                        <div className="whitespace-pre-wrap wrap-break-word">
                          {message.content}
                        </div>
                      ))}
                    {canInsert && (
                      <div className="mt-2 flex justify-end">
                        <Button
                          type="button"
                          variant={message.inserted ? "ghost" : "secondary"}
                          size="sm"
                          className="h-7 gap-1.5 px-2 text-xs"
                          onClick={() => enterInsertMode(message.id)}
                        >
                          <MousePointerClick size={12} />
                          {message.inserted
                            ? t("askAi.inserted")
                            : t("askAi.insertResponse")}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Referenced notes pills */}
        {referencedNotes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-b px-4 py-2">
            {referencedNotes.map((note) => (
              <span
                key={note.id}
                className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-xs"
              >
                {note.title}
                <button
                  type="button"
                  disabled={isLoading}
                  className="ml-0.5 rounded-full hover:text-destructive"
                  onClick={() => removeReferencedNote(note.id)}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className="relative p-3">
          {showMentionPopover && !isLoading && (
            <div className="absolute bottom-full left-3 right-3 z-10 mb-1">
              <NoteMentionPopover
                filter={mentionFilter}
                onSelect={handleMentionSelect}
                selectedNoteIds={selectedNoteIds}
              />
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={prompt}
              disabled={isLoading}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={t("askAi.placeholder")}
              rows={1}
              className="max-h-32 min-h-10 flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60 focus:ring-1 focus:ring-ring"
              style={{
                height: "auto",
                minHeight: "2.5rem",
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
              }}
            />
            {isLoading ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 rounded-full"
                onClick={interrupt}
                title={t("aiMenu.interrupt")}
              >
                <Square size={16} className="fill-current" />
              </Button>
            ) : (
              <Button
                type="button"
                variant="default"
                size="icon"
                className="shrink-0 rounded-full"
                disabled={!prompt.trim()}
                onClick={submit}
                title={t("aiMenu.send")}
              >
                <ArrowUp size={16} />
              </Button>
            )}
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            {t("askAi.mentionHint")}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
};
