import { Button } from "@/components/ui/button";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { saveNoteAction } from "@/lib/actions";
import { getNoteContentFromStore } from "@/store/slices/notes";
import { useStore } from "@/store/useStore";
import type { Note } from "@/types";
import { Calendar, Check } from "lucide-react";
import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

type TimePart = "hours" | "minutes" | "seconds";

const CREATED_AT_TIME_MAX: Record<TimePart, number> = {
  hours: 23,
  minutes: 59,
  seconds: 59,
};

function getTimeParts(time: string): Record<TimePart, string> {
  const [hours = "", minutes = "", seconds = ""] = time.split(":");
  return { hours, minutes, seconds };
}

function updateTimePart(time: string, part: TimePart, value: string): string {
  const nextValue = value.replace(/\D/g, "").slice(0, 2);
  const parts = getTimeParts(time);
  parts[part] = nextValue;
  return `${parts.hours}:${parts.minutes}:${parts.seconds}`;
}

function normalizeTimePart(value: string, max: number): string {
  if (!value) return "00";
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return "00";
  return String(Math.min(Math.max(parsed, 0), max)).padStart(2, "0");
}

function normalizeCreatedAtTime(time: string): string {
  const { hours, minutes, seconds } = getTimeParts(time);
  return [
    normalizeTimePart(hours, CREATED_AT_TIME_MAX.hours),
    normalizeTimePart(minutes, CREATED_AT_TIME_MAX.minutes),
    normalizeTimePart(seconds, CREATED_AT_TIME_MAX.seconds),
  ].join(":");
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

interface CreatedAtEditorProps {
  note: Note;
}

/**
 * Popover component for editing a note's createdAt timestamp.
 */
export function CreatedAtEditor({ note }: CreatedAtEditorProps) {
  const { t } = useTranslation();
  const updateNote = useStore((state) => state.updateNote);

  const initialDate = new Date(note.createdAt);
  const hh = String(initialDate.getHours()).padStart(2, "0");
  const mm = String(initialDate.getMinutes()).padStart(2, "0");
  const ss = String(initialDate.getSeconds()).padStart(2, "0");

  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [tempDate, setTempDate] = useState<Date | undefined>(initialDate);
  const [tempTime, setTempTime] = useState(`${hh}:${mm}:${ss}`);

  // Re-sync local state when the note's createdAt changes externally
  const [lastCreatedAt, setLastCreatedAt] = useState(note.createdAt);
  if (note.createdAt !== lastCreatedAt) {
    const d = new Date(note.createdAt);
    const newHh = String(d.getHours()).padStart(2, "0");
    const newMm = String(d.getMinutes()).padStart(2, "0");
    const newSs = String(d.getSeconds()).padStart(2, "0");
    setTempDate(d);
    setTempTime(`${newHh}:${newMm}:${newSs}`);
    setLastCreatedAt(note.createdAt);
  }

  const timeParts = getTimeParts(tempTime);

  const handleTimeChange = useCallback((part: TimePart, value: string) => {
    setTempTime((prev) => updateTimePart(prev, part, value));
  }, []);

  const handleTimeBlur = useCallback(() => {
    setTempTime((prev) => normalizeCreatedAtTime(prev));
  }, []);

  const handleSave = async () => {
    if (!tempDate) return;

    setIsSaving(true);

    try {
      const normalizedTime = normalizeCreatedAtTime(tempTime);
      const [hours, minutes, seconds] = normalizedTime.split(":").map(Number);
      const newDate = new Date(tempDate);
      const updatedAt = new Date().toISOString();
      const latestNote = useStore.getState().notesById.get(note.id) ?? note;

      newDate.setHours(hours ?? 0, minutes ?? 0, seconds ?? 0, 0);

      const newCreatedAt = newDate.toISOString();

      const result = await saveNoteAction({
        ...latestNote,
        content: getNoteContentFromStore(note.id),
        createdAt: newCreatedAt,
        updatedAt,
      });

      updateNote(note.id, { createdAt: newCreatedAt, updatedAt });

      setTempTime(normalizedTime);
      setIsOpen(false);
      if (result.warnings.length > 0) {
        toast.warning(t("note.createdAtUpdatedWithWarnings"));
      } else {
        toast.success(t("note.createdAtUpdated"));
      }
    } catch (error) {
      console.error("Failed to update note creation date:", error);
      toast.error(getErrorMessage(error, t("note.failedToUpdateCreatedAt")));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center rounded-lg px-2 py-1 transition-colors hover:bg-accent hover:text-accent-foreground"
          title={t("note.editCreatedAt")}
        >
          <Calendar size={20} className="mr-1" /> {t("note.created")}:{" "}
          {new Date(note.createdAt).toLocaleString()}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="flex justify-center">
          <CalendarUI
            mode="single"
            selected={tempDate}
            onSelect={(d: Date | undefined) => {
              if (d) setTempDate(d);
            }}
          />
        </div>
        <div className="flex flex-col gap-3 border-t border-border p-3">
          <div className="grid grid-cols-3 gap-2">
            <Input
              type="text"
              inputMode="numeric"
              placeholder={t("note.createdAtHourPlaceholder")}
              aria-label={t("note.createdAtHour")}
              value={timeParts.hours}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                handleTimeChange("hours", e.target.value)
              }
              onBlur={handleTimeBlur}
              className="bg-background text-center"
            />
            <Input
              type="text"
              inputMode="numeric"
              placeholder={t("note.createdAtMinutePlaceholder")}
              aria-label={t("note.createdAtMinute")}
              value={timeParts.minutes}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                handleTimeChange("minutes", e.target.value)
              }
              onBlur={handleTimeBlur}
              className="bg-background text-center"
            />
            <Input
              type="text"
              inputMode="numeric"
              placeholder={t("note.createdAtSecondPlaceholder")}
              aria-label={t("note.createdAtSecond")}
              value={timeParts.seconds}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                handleTimeChange("seconds", e.target.value)
              }
              onBlur={handleTimeBlur}
              className="bg-background text-center"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              disabled={isSaving}
            >
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              <Check size={14} className="mr-1" />
              {isSaving ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
