import { format } from "date-fns";
import { CalendarIcon, XIcon } from "lucide-react";
import React from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { getDateKey } from "@/lib/notes/noteDerivedData";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  /** The currently selected date, or null if no date is selected */
  date: Date | null;
  /** Callback fired when the date selection changes */
  onDateChange: (date: Date | null) => void;
  /** Cached note counts for the current active note set. */
  noteCountsByDate: Map<string, number>;
}

/**
 * A date picker component for filtering notes by a specific date.
 * Uses a modal calendar for date selection and note-count previews.
 */
export function DatePicker({
  date,
  onDateChange,
  noteCountsByDate,
}: DatePickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const previousOpenRef = React.useRef(false);

  React.useEffect(() => {
    if (!open && previousOpenRef.current) {
      triggerRef.current?.focus();
    }

    previousOpenRef.current = open;
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      // If the same date is selected, clear the filter
      if (
        date &&
        selectedDate.getFullYear() === date.getFullYear() &&
        selectedDate.getMonth() === date.getMonth() &&
        selectedDate.getDate() === date.getDate()
      ) {
        onDateChange(null);
      } else {
        onDateChange(selectedDate);
      }
    }
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDateChange(null);
  };

  const getDayTooltip = React.useCallback(
    (day: Date) => {
      const count = noteCountsByDate.get(getDateKey(day)) ?? 0;

      if (count === 0) {
        return null;
      }

      return t("common.datePicker.notesOnDate", {
        count,
        date: format(day, "PPP"),
      });
    },
    [noteCountsByDate, t],
  );

  const hasNotesModifier = React.useCallback(
    (day: Date) => noteCountsByDate.has(getDateKey(day)),
    [noteCountsByDate],
  );

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          size="icon"
          data-empty={!date}
          onClick={() => setOpen(true)}
          className={cn(
            "relative size-9 rounded-xl",
            date && "text-primary",
            !date && "text-muted-foreground",
          )}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={
            date ? format(date, "PPP") : t("common.datePicker.pickDate")
          }
        >
          <CalendarIcon className="size-4" />
          {date && (
            <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />
          )}
        </Button>
        {date && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleClear}
            aria-label={t("common.datePicker.clearFilter")}
          >
            <XIcon className="size-4" />
          </Button>
        )}
      </div>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-60 flex animate-in items-center justify-center bg-black/45 p-4 backdrop-blur-sm duration-200 fade-in">
            <div
              className="absolute inset-0"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="date-picker-modal-title"
              className="relative flex w-full max-w-md animate-in flex-col rounded-2xl border border-border bg-card shadow-2xl duration-200 zoom-in-95"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <h2
                    id="date-picker-modal-title"
                    className="text-base font-semibold text-foreground"
                  >
                    {t("common.datePicker.modalTitle")}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={t("common.close")}
                >
                  <XIcon className="size-4" />
                </button>
              </div>
              <div className="flex justify-center p-4">
                <Calendar
                  mode="single"
                  selected={date ?? undefined}
                  onSelect={handleSelect}
                  modifiers={{ hasNotes: hasNotesModifier }}
                  getDayTooltip={getDayTooltip}
                />
              </div>
              <div className="flex items-center justify-between border-t border-border px-5 py-4">
                <span className="text-sm text-muted-foreground">
                  {date
                    ? format(date, "PPP")
                    : t("common.datePicker.noDateSelected")}
                </span>
                <div className="flex items-center gap-2">
                  {date && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        onDateChange(null);
                        setOpen(false);
                      }}
                    >
                      {t("common.datePicker.clearFilter")}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(false)}
                  >
                    {t("common.close")}
                  </Button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
