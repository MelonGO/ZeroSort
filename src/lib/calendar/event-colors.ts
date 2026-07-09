import { EventColor } from "@/lib/calendar/types";

export interface EventColorOption {
  value: EventColor;
  label: string;
  bgClass: string;
}

export const EVENT_COLOR_OPTIONS: EventColorOption[] = [
  { value: "blue", label: "Blue", bgClass: "bg-[var(--event-blue)]" },
  { value: "green", label: "Green", bgClass: "bg-[var(--event-green)]" },
  { value: "yellow", label: "Yellow", bgClass: "bg-[var(--event-yellow)]" },
  { value: "orange", label: "Orange", bgClass: "bg-[var(--event-orange)]" },
  { value: "red", label: "Red", bgClass: "bg-[var(--event-red)]" },
  { value: "pink", label: "Pink", bgClass: "bg-[var(--event-pink)]" },
  { value: "purple", label: "Purple", bgClass: "bg-[var(--event-purple)]" },
  { value: "teal", label: "Teal", bgClass: "bg-[var(--event-teal)]" },
  { value: "indigo", label: "Indigo", bgClass: "bg-[var(--event-indigo)]" },
];

export const EVENT_COLOR_VALUES = EVENT_COLOR_OPTIONS.map(
  (option) => option.value,
) as EventColor[];

export function getRandomEventColor(): EventColor {
  return EVENT_COLOR_VALUES[
    Math.floor(Math.random() * EVENT_COLOR_VALUES.length)
  ];
}

export const EVENT_CARD_COLOR_CLASSES: Record<EventColor, string> = {
  blue: "bg-[var(--event-blue)] text-[var(--event-blue-fg)] border-[var(--event-blue-fg)]/20",
  green:
    "bg-[var(--event-green)] text-[var(--event-green-fg)] border-[var(--event-green-fg)]/20",
  yellow:
    "bg-[var(--event-yellow)] text-[var(--event-yellow-fg)] border-[var(--event-yellow-fg)]/20",
  orange:
    "bg-[var(--event-orange)] text-[var(--event-orange-fg)] border-[var(--event-orange-fg)]/20",
  red: "bg-[var(--event-red)] text-[var(--event-red-fg)] border-[var(--event-red-fg)]/20",
  pink: "bg-[var(--event-pink)] text-[var(--event-pink-fg)] border-[var(--event-pink-fg)]/20",
  purple:
    "bg-[var(--event-purple)] text-[var(--event-purple-fg)] border-[var(--event-purple-fg)]/20",
  teal: "bg-[var(--event-teal)] text-[var(--event-teal-fg)] border-[var(--event-teal-fg)]/20",
  indigo:
    "bg-[var(--event-indigo)] text-[var(--event-indigo-fg)] border-[var(--event-indigo-fg)]/20",
};
