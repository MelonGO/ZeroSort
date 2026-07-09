import { CalendarEvent } from "@/lib/calendar/types";

interface OverlapLayout {
  columnIndex: number;
  totalColumns: number;
}

/**
 * Check if two timed events overlap by comparing their start/end time strings.
 */
function eventsOverlap(a: CalendarEvent, b: CalendarEvent): boolean {
  return a.startTime < b.endTime && b.startTime < a.endTime;
}

/**
 * Compute column layout for overlapping timed events.
 * Returns a Map keyed by event ID with { columnIndex, totalColumns }.
 *
 * Algorithm:
 * 1. Sort events by start time, then by duration descending (longer first).
 * 2. Greedily assign each event to the first available column.
 * 3. Group connected overlapping events into clusters and set totalColumns
 *    to the max column count within each cluster.
 */
export function computeOverlapLayout(
  events: CalendarEvent[],
): Map<string, OverlapLayout> {
  if (events.length === 0) return new Map();

  // Sort: earliest start first, then longest duration first
  const sorted = [...events].sort((a, b) => {
    if (a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1;
    // Longer events first (earlier end = shorter)
    return b.endTime < a.endTime ? -1 : b.endTime > a.endTime ? 1 : 0;
  });

  // Assign columns greedily
  const columnMap = new Map<string, number>();
  const columnEnds: string[] = []; // tracks the end time of the last event in each column

  for (const event of sorted) {
    let placed = false;
    for (let col = 0; col < columnEnds.length; col++) {
      if (columnEnds[col] <= event.startTime) {
        columnEnds[col] = event.endTime;
        columnMap.set(event.id, col);
        placed = true;
        break;
      }
    }
    if (!placed) {
      columnMap.set(event.id, columnEnds.length);
      columnEnds.push(event.endTime);
    }
  }

  // Build overlap clusters (connected components)
  const clusters: CalendarEvent[][] = [];
  const visited = new Set<string>();

  for (const event of sorted) {
    if (visited.has(event.id)) continue;
    const cluster: CalendarEvent[] = [];
    const stack = [event];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current.id)) continue;
      visited.add(current.id);
      cluster.push(current);
      for (const other of sorted) {
        if (!visited.has(other.id) && eventsOverlap(current, other)) {
          stack.push(other);
        }
      }
    }
    clusters.push(cluster);
  }

  // Build final result: totalColumns = max column index + 1 within each cluster
  const result = new Map<string, OverlapLayout>();
  for (const cluster of clusters) {
    const totalColumns =
      Math.max(...cluster.map((e) => columnMap.get(e.id)!)) + 1;
    for (const event of cluster) {
      result.set(event.id, {
        columnIndex: columnMap.get(event.id)!,
        totalColumns,
      });
    }
  }

  return result;
}
