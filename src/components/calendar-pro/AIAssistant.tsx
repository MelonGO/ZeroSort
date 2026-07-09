import {
  Loader2,
  MessageSquare,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { AIMessage, PendingCalendarAction } from "@/lib/calendar/aiTypes";
import { cn } from "@/lib/utils";
import "@/styles/ai-assistant.css";
import { aiAssistantToggleClassName } from "@/styles/aiAssistantClassNames";

interface AIAssistantProps {
  onSubmit: (message: string) => Promise<void>;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  onReset: () => void;
  messages: AIMessage[];
  pendingConfirmation?: PendingCalendarAction;
  isProcessing: boolean;
  isOpen: boolean;
  onToggle: () => void;
}

const AssistantMessage = memo(function AssistantMessage({
  isProcessing,
  message,
  pendingConfirmation,
  onChipClick,
}: {
  isProcessing: boolean;
  message: AIMessage;
  pendingConfirmation?: PendingCalendarAction;
  onChipClick: (message: string) => void | Promise<void>;
}) {
  const { i18n } = useTranslation();
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
        hour: "numeric",
        minute: "2-digit",
      }),
    [i18n.language, i18n.resolvedLanguage],
  );
  const options = useMemo(
    () =>
      Array.from(
        new Set([
          ...(message.clarificationOptions || []),
          ...(message.suggestions || []),
        ]),
      ).slice(0, 4),
    [message.clarificationOptions, message.suggestions],
  );

  return (
    <div
      className={cn(
        "kanban-ai-message",
        message.role === "user"
          ? "kanban-ai-message--user"
          : "kanban-ai-message--assistant",
      )}
    >
      <div className="kanban-ai-message__bubble">{message.content}</div>
      {message.role === "assistant" &&
      !pendingConfirmation &&
      options.length > 0 ? (
        <div className="kanban-ai-message__chips">
          {options.map((option) => (
            <Button
              className="kanban-ai-chip"
              disabled={isProcessing}
              key={`${message.id}-${option}`}
              onClick={() => void onChipClick(option)}
              size="xs"
              type="button"
              variant="outline"
            >
              {option}
            </Button>
          ))}
        </div>
      ) : null}
      <time>{timeFormatter.format(message.timestamp)}</time>
    </div>
  );
});

/** Floating assistant panel for AI calendar commands. */
export function AIAssistant({
  onSubmit,
  onConfirm,
  onCancel,
  onReset,
  messages,
  pendingConfirmation,
  isProcessing,
  isOpen,
  onToggle,
}: AIAssistantProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const openAriaLabel = t("event-calendar.assistant.openAriaLabel", {
    defaultValue: "Open AI calendar assistant",
  });
  const panelAriaLabel = t("event-calendar.assistant.panelAriaLabel", {
    defaultValue: "AI calendar assistant",
  });
  const title = t("event-calendar.assistant.title", {
    defaultValue: "AI calendar assistant",
  });
  const subtitle = t("event-calendar.assistant.subtitle", {
    defaultValue: "Create, update, remove, and find events",
  });
  const closeAriaLabel = t("event-calendar.assistant.closeAriaLabel", {
    defaultValue: "Close AI assistant",
  });
  const thinking = t("event-calendar.assistant.thinking", {
    defaultValue: "Reviewing your calendar...",
  });
  const inputAriaLabel = t("event-calendar.assistant.inputAriaLabel", {
    defaultValue: "Message AI calendar assistant",
  });

  useEffect(() => {
    const container = messagesContainerRef.current;

    if (!container) {
      return;
    }

    container.scrollTo({
      behavior: "smooth",
      top: container.scrollHeight,
    });
  }, [messages, pendingConfirmation]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!input.trim() || isProcessing) {
      return;
    }

    const message = input.trim();
    setInput("");
    await onSubmit(message);
  };

  const handleChipClick = useCallback(
    async (message: string) => {
      if (isProcessing) {
        return;
      }

      await onSubmit(message);
    },
    [isProcessing, onSubmit],
  );

  return (
    <>
      {!isOpen ? (
        <Button
          aria-label={openAriaLabel}
          className={aiAssistantToggleClassName}
          onClick={onToggle}
          size="icon-lg"
          type="button"
        >
          <Sparkles size={20} />
        </Button>
      ) : null}

      {isOpen ? (
        <aside aria-label={panelAriaLabel} className="kanban-ai-panel">
          <header className="kanban-ai-panel__header">
            <div className="kanban-ai-panel__title">
              <span>
                <MessageSquare size={18} />
              </span>
              <div>
                <h2>{title}</h2>
                <p>{subtitle}</p>
              </div>
            </div>
            <div className="kanban-ai-panel__actions">
              <Button
                disabled={
                  isProcessing ||
                  (messages.length === 0 && !pendingConfirmation)
                }
                onClick={onReset}
                size="sm"
                type="button"
                variant="ghost"
              >
                <RotateCcw size={14} />
                {t("event-calendar.actions.reset")}
              </Button>
              <Button
                aria-label={closeAriaLabel}
                onClick={onToggle}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <X size={16} />
              </Button>
            </div>
          </header>

          <div className="kanban-ai-panel__messages" ref={messagesContainerRef}>
            {messages.length === 0 ? (
              <div className="kanban-ai-empty">
                <Sparkles size={34} />
                <p>{t("event-calendar.assistant.emptyTitle")}</p>
                <span>{t("event-calendar.assistant.emptyHint")}</span>
              </div>
            ) : null}

            {messages.map((message) => (
              <AssistantMessage
                isProcessing={isProcessing}
                key={message.id}
                message={message}
                onChipClick={handleChipClick}
                pendingConfirmation={pendingConfirmation}
              />
            ))}

            {isProcessing ? (
              <div className="kanban-ai-message kanban-ai-message--assistant">
                <div className="kanban-ai-message__bubble kanban-ai-message__bubble--loading">
                  <Loader2 size={16} />
                  {thinking}
                </div>
              </div>
            ) : null}

            {pendingConfirmation && !isProcessing ? (
              <div className="kanban-ai-confirmation">
                <strong>{t("event-calendar.assistant.confirmDeletion")}</strong>
                <p>{pendingConfirmation.message}</p>
                <ul>
                  {pendingConfirmation.eventTitles.map((title) => (
                    <li key={title}>{title}</li>
                  ))}
                </ul>
                <div>
                  <Button
                    onClick={onConfirm}
                    size="sm"
                    type="button"
                    variant="destructive"
                  >
                    {t("event-calendar.actions.confirm")}
                  </Button>
                  <Button
                    onClick={onCancel}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {t("event-calendar.actions.cancel")}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <form className="kanban-ai-panel__composer" onSubmit={handleSubmit}>
            <input
              aria-label={inputAriaLabel}
              disabled={isProcessing}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t("event-calendar.assistant.placeholder")}
              value={input}
            />
            <Button
              aria-label={t("event-calendar.assistant.send")}
              disabled={!input.trim() || isProcessing}
              size="icon"
              type="submit"
            >
              <Send size={16} />
            </Button>
          </form>
        </aside>
      ) : null}
    </>
  );
}
