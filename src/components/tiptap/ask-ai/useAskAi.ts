import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useNoModelSelectedToast } from "@/hooks/useNoModelSelectedToast";
import { getModelFromConfig } from "@/lib/ai/provider";
import { tiptapJsonToMarkdown } from "@/lib/ai/tiptapMarkdown";
import { getNoteContentFromStore } from "@/store/slices/notes";
import { useStore } from "@/store/useStore";
import type { Editor } from "@tiptap/react";
import { streamText, type ModelMessage } from "ai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReferencedNote {
  id: string;
  title: string;
}

/** A single Ask AI chat message shown in the panel transcript. */
export interface AskAiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: "streaming" | "complete" | "error";
  inserted?: boolean;
}

/** Public state and actions for the Ask AI panel. */
export interface UseAskAiReturn {
  isOpen: boolean;
  prompt: string;
  setPrompt: (v: string) => void;
  referencedNotes: ReferencedNote[];
  addReferencedNote: (note: ReferencedNote) => void;
  removeReferencedNote: (id: string) => void;
  messages: AskAiMessage[];
  isLoading: boolean;
  isInsertMode: boolean;
  open: () => void;
  close: () => void;
  submit: () => void;
  interrupt: () => void;
  discard: () => void;
  clearChat: () => void;
  enterInsertMode: (messageId: string) => void;
  cancelInsertMode: () => void;
  handleEditorClick: (pos: number) => void;
}

const createMessageId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Manages the Ask AI conversation and editor insertion workflow. */
export function useAskAi(editor: Editor, noteId?: string): UseAskAiReturn {
  const { t } = useTranslation();
  const showNoModelSelectedToast = useNoModelSelectedToast();

  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [referencedNotes, setReferencedNotes] = useState<ReferencedNote[]>([]);
  const [messages, setMessages] = useState<AskAiMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInsertMode, setIsInsertMode] = useState(false);
  const [insertMessageId, setInsertMessageId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const open = useCallback(() => setIsOpen(true), []);

  const close = useCallback(() => {
    if (isLoading) {
      abortControllerRef.current?.abort();
    }
    setIsOpen(false);
    setIsLoading(false);
    setIsInsertMode(false);
    setInsertMessageId(null);
  }, [isLoading]);

  const addReferencedNote = useCallback((note: ReferencedNote) => {
    setReferencedNotes((prev) => {
      if (prev.some((n) => n.id === note.id)) return prev;
      return [...prev, note];
    });
  }, []);

  const removeReferencedNote = useCallback((id: string) => {
    setReferencedNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearChat = useCallback(() => {
    if (isLoading) {
      abortControllerRef.current?.abort();
    }

    abortControllerRef.current = null;
    setMessages([]);
    setPrompt("");
    setReferencedNotes([]);
    setIsLoading(false);
    setIsInsertMode(false);
    setInsertMessageId(null);
  }, [isLoading]);

  const interrupt = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  const submit = useCallback(async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || isLoading) return;

    const { modelConfigs, activeConfigId, selectedModelId } =
      useStore.getState();
    const activeConfig = modelConfigs.find((c) => c.id === activeConfigId);

    if (!activeConfig || !selectedModelId) {
      showNoModelSelectedToast();
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    let context = "";
    for (const ref of referencedNotes) {
      const content = getNoteContentFromStore(ref.id);
      if (content) {
        const markdown = tiptapJsonToMarkdown(content);
        context += `--- Note: ${ref.title} ---\n${markdown}\n\n`;
      }
    }

    if (noteId && referencedNotes.length > 0) {
      const currentContent = getNoteContentFromStore(noteId);
      if (currentContent) {
        const currentMarkdown = tiptapJsonToMarkdown(currentContent);
        context += `--- Current Note ---\n${currentMarkdown}\n\n`;
      }
    }

    const userMessage: AskAiMessage = {
      id: createMessageId(),
      role: "user",
      content: trimmedPrompt,
    };
    const assistantMessage: AskAiMessage = {
      id: createMessageId(),
      role: "assistant",
      content: "",
      status: "streaming",
    };
    const nextMessages = [...messages, userMessage, assistantMessage];
    const modelMessages: ModelMessage[] = [];

    if (context) {
      modelMessages.push({
        role: "system",
        content: `${t("askAi.contextPrefix")}\n\n${context}`,
      });
    }

    for (const message of nextMessages) {
      if (!message.content.trim()) continue;
      modelMessages.push({
        role: message.role,
        content: message.content,
      });
    }

    setMessages(nextMessages);
    setPrompt("");
    setIsLoading(true);
    setIsInsertMode(false);
    setInsertMessageId(null);

    let fullText = "";
    try {
      const result = streamText({
        model: await getModelFromConfig(activeConfig, selectedModelId),
        messages: modelMessages,
        abortSignal: abortController.signal,
      });

      for await (const chunk of result.textStream) {
        fullText += chunk;
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: fullText }
              : message,
          ),
        );
      }

      if (!fullText.trim()) {
        toast.error(t("aiMenu.errors.emptyResponse"));
        setMessages((prev) =>
          prev.filter((message) => message.id !== assistantMessage.id),
        );
        return;
      }

      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantMessage.id
            ? { ...message, content: fullText, status: "complete" }
            : message,
        ),
      );
    } catch (error: any) {
      if (error.name === "AbortError") {
        setMessages((prev) => {
          if (!fullText.trim()) {
            return prev.filter((message) => message.id !== assistantMessage.id);
          }

          return prev.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: fullText, status: "complete" }
              : message,
          );
        });
        return;
      }

      console.error("Ask AI failed:", error);
      toast.error(t("aiMenu.errors.failed"));
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantMessage.id
            ? { ...message, status: "error" }
            : message,
        ),
      );
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [
    prompt,
    isLoading,
    referencedNotes,
    messages,
    noteId,
    showNoModelSelectedToast,
    t,
  ]);

  const enterInsertMode = useCallback((messageId: string) => {
    setInsertMessageId(messageId);
    setIsInsertMode(true);
  }, []);

  const cancelInsertMode = useCallback(() => {
    setIsInsertMode(false);
    setInsertMessageId(null);
  }, []);

  const handleEditorClick = useCallback(
    (pos: number) => {
      if (!isInsertMode || !insertMessageId) return;

      const message = messages.find((item) => item.id === insertMessageId);
      if (!message?.content.trim()) return;

      try {
        const result = editor.commands.insertContent(message.content, {
          contentType: "markdown",
        });

        if (!result) {
          throw new Error("insertion failed");
        }

        toast.success(t("aiMenu.success"));
      } catch (error) {
        console.warn("Markdown insertion failed, falling back:", error);
        editor.chain().focus().insertContentAt(pos, message.content).run();
      }

      setMessages((prev) =>
        prev.map((item) =>
          item.id === insertMessageId ? { ...item, inserted: true } : item,
        ),
      );
      setIsInsertMode(false);
      setInsertMessageId(null);
      setIsOpen(true);
    },
    [isInsertMode, insertMessageId, messages, editor, t],
  );

  return {
    isOpen,
    prompt,
    setPrompt,
    referencedNotes,
    addReferencedNote,
    removeReferencedNote,
    messages,
    isLoading,
    isInsertMode,
    open,
    close,
    submit,
    interrupt,
    discard: clearChat,
    clearChat,
    enterInsertMode,
    cancelInsertMode,
    handleEditorClick,
  };
}
