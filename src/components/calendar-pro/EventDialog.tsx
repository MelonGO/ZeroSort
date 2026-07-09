import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EVENT_COLOR_OPTIONS } from "@/lib/calendar/event-colors";
import { CalendarEvent, EventColor } from "@/lib/calendar/types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarIcon, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

interface EventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (event: CalendarEvent) => void;
  onDelete?: (eventId: string) => void;
  initialDate?: string;
  initialEndDate?: string;
  initialStartTime?: string;
  event?: CalendarEvent;
}

interface EventFormState {
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  color: EventColor;
  isAllDay: boolean;
}

function getDefaultEndTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const totalMinutes = Math.min(hours * 60 + minutes + 60, 23 * 60 + 59);
  const endHours = Math.floor(totalMinutes / 60);
  const endMinutes = totalMinutes % 60;

  return `${endHours.toString().padStart(2, "0")}:${endMinutes.toString().padStart(2, "0")}`;
}

function formatDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateValue(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return undefined;
  }

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function normalizeTime(value: string): string {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(value.trim());
  if (!match) {
    return value;
  }

  const [, hoursValue, minutesValue] = match;
  const hours = Number(hoursValue);
  const minutes = Number(minutesValue);
  if (hours > 23 || minutes > 59) {
    return value;
  }

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

function createFormState({
  initialDate,
  initialEndDate,
  initialStartTime,
  event,
}: {
  initialDate?: string;
  initialEndDate?: string;
  initialStartTime?: string;
  event?: CalendarEvent;
}): EventFormState {
  if (event) {
    return {
      title: event.title,
      description: event.description,
      startDate: event.startDate,
      endDate: event.endDate,
      startTime: event.startTime,
      endTime: event.endTime,
      color: event.color,
      isAllDay: event.isAllDay,
    };
  }

  const startTime = initialStartTime || "09:00";

  return {
    title: "",
    description: "",
    startDate: initialDate || "",
    endDate: initialEndDate || initialDate || "",
    startTime,
    endTime: getDefaultEndTime(startTime),
    color: "blue",
    isAllDay: false,
  };
}

export function EventDialog({
  open,
  onOpenChange,
  onSave,
  onDelete,
  initialDate,
  initialEndDate,
  initialStartTime,
  event,
}: EventDialogProps) {
  const { t } = useTranslation();
  const [formState, setFormState] = useState<EventFormState>(() =>
    createFormState({ initialDate, initialEndDate, initialStartTime, event }),
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setFormState(
      createFormState({ initialDate, initialEndDate, initialStartTime, event }),
    );
  }, [open, event, initialDate, initialEndDate, initialStartTime]);

  const {
    title,
    description,
    startDate,
    endDate,
    startTime,
    endTime,
    color,
    isAllDay,
  } = formState;

  const updateFormState = useCallback((updates: Partial<EventFormState>) => {
    setFormState((currentState) => ({ ...currentState, ...updates }));
  }, []);

  const hasInvalidTime =
    !isAllDay && (!isValidTime(startTime) || !isValidTime(endTime));
  const isInvalid = useMemo(() => {
    if (!startDate || !endDate) return false;
    if (hasInvalidTime) return false;
    const start = new Date(`${startDate}T${isAllDay ? "00:00" : startTime}`);
    const end = new Date(`${endDate}T${isAllDay ? "23:59" : endTime}`);
    return end < start;
  }, [endDate, endTime, hasInvalidTime, isAllDay, startDate, startTime]);

  const handleSave = useCallback(() => {
    if (!title || !startDate || !endDate || hasInvalidTime || isInvalid) return;

    const newEvent: CalendarEvent = {
      id: event?.id || Date.now().toString(),
      title,
      description: description.trim(),
      startDate,
      endDate,
      startTime: isAllDay ? "00:00" : startTime,
      endTime: isAllDay ? "23:59" : endTime,
      color,
      isAllDay,
    };

    onSave(newEvent);
    setFormState(
      createFormState({ initialDate, initialEndDate, initialStartTime }),
    );
    onOpenChange(false);
  }, [
    color,
    description,
    endDate,
    endTime,
    event?.id,
    initialDate,
    initialEndDate,
    initialStartTime,
    isAllDay,
    hasInvalidTime,
    isInvalid,
    onOpenChange,
    onSave,
    startDate,
    startTime,
    title,
  ]);

  const handleDelete = useCallback(() => {
    if (event && onDelete) {
      onDelete(event.id);
      onOpenChange(false);
    }
  }, [event, onDelete, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-125 p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>
            {event
              ? t("event-calendar.dialog.editEvent")
              : t("event-calendar.dialog.addEvent")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">
              {t("event-calendar.dialog.eventTitle")}
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => updateFormState({ title: e.target.value })}
              placeholder={t("event-calendar.dialog.eventTitlePlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">
              {t("event-calendar.dialog.description")}
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => updateFormState({ description: e.target.value })}
              placeholder={t("event-calendar.dialog.descriptionPlaceholder")}
              rows={4}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="start-date">
                {t("event-calendar.dialog.startDate")}
              </Label>
              <DatePickerField
                id="start-date"
                value={startDate}
                placeholder={t("event-calendar.dialog.startDate")}
                onChange={(nextStartDate) => {
                  if (!endDate || nextStartDate > endDate) {
                    updateFormState({
                      startDate: nextStartDate,
                      endDate: nextStartDate,
                    });
                    return;
                  }

                  updateFormState({ startDate: nextStartDate });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">
                {t("event-calendar.dialog.endDate")}
              </Label>
              <DatePickerField
                id="end-date"
                value={endDate}
                placeholder={t("event-calendar.dialog.endDate")}
                onChange={(nextEndDate) =>
                  updateFormState({ endDate: nextEndDate })
                }
                disabledBefore={parseDateValue(startDate)}
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="all-day"
              checked={isAllDay}
              onCheckedChange={(checked) =>
                updateFormState({ isAllDay: checked })
              }
            />
            <Label htmlFor="all-day" className="cursor-pointer">
              {t("event-calendar.dialog.allDayEvent")}
            </Label>
          </div>

          {!isAllDay && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="start-time">
                  {t("event-calendar.dialog.startTime")}
                </Label>
                <TimeField
                  id="start-time"
                  value={startTime}
                  onChange={(nextStartTime) =>
                    updateFormState({ startTime: nextStartTime })
                  }
                  invalid={!isValidTime(startTime)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-time">
                  {t("event-calendar.dialog.endTime")}
                </Label>
                <TimeField
                  id="end-time"
                  value={endTime}
                  onChange={(nextEndTime) =>
                    updateFormState({ endTime: nextEndTime })
                  }
                  invalid={!isValidTime(endTime) || isInvalid}
                />
              </div>
            </div>
          )}

          {isInvalid && (
            <p className="text-sm text-destructive font-medium">
              {t("event-calendar.dialog.invalidEndTime")}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="color">{t("event-calendar.dialog.color")}</Label>
            <Select
              value={color}
              onValueChange={(value) =>
                updateFormState({ color: value as EventColor })
              }
            >
              <SelectTrigger id="color">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_COLOR_OPTIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded ${c.bgClass}`} />
                      {t(`event-calendar.colors.${c.value}`)}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {event && onDelete && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              className="w-full sm:mr-auto sm:w-auto"
            >
              <Trash2 className="mr-2" />
              {t("event-calendar.actions.delete")}
            </Button>
          )}
          <div className="ml-auto flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto"
            >
              {t("event-calendar.actions.cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                !title || !startDate || !endDate || hasInvalidTime || isInvalid
              }
              className="w-full sm:w-auto"
            >
              {t("event-calendar.actions.saveEvent")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DatePickerField({
  id,
  value,
  placeholder,
  onChange,
  disabledBefore,
}: {
  id: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  disabledBefore?: Date;
}) {
  const selectedDate = parseDateValue(value);
  const disabledBeforeValue = disabledBefore
    ? formatDateValue(disabledBefore)
    : undefined;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !selectedDate && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-2 size-4" />
          {selectedDate ? format(selectedDate, "PPP") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="z-60 w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          disabled={
            disabledBeforeValue
              ? (date) => formatDateValue(date) < disabledBeforeValue
              : undefined
          }
          onSelect={(date) => {
            if (date) {
              onChange(formatDateValue(date));
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function TimeField({
  id,
  value,
  onChange,
  invalid,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  className?: string;
}) {
  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => onChange(normalizeTime(value))}
      placeholder="HH:mm"
      aria-invalid={invalid}
      className={cn(invalid && "border-destructive", className)}
    />
  );
}
