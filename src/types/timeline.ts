import { Note } from "./index";

export interface MonthGroup {
  id: string; // e.g., "2023-10"
  year: number;
  month: number;
  notes: Note[];
  title: string;
}

export interface ScrubberMonth {
  year: number;
  month: number;
  title: string;
  count: number;
  height?: number;
}
