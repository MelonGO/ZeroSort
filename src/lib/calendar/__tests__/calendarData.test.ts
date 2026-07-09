/**
 * Tests calendar node data normalization and serialization for embedded Tiptap calendar blocks.
 */
import {
  createDefaultCalendarNodeData,
  normalizeCalendarNodeData,
  serializeCalendarNodeData,
} from "@/lib/calendar/calendarData";
import { describe, expect, it } from "vitest";

describe("calendarData", () => {
  it("Should create a default versioned calendar payload", () => {
    const data = createDefaultCalendarNodeData();

    expect(data.version).toBe(1);
    expect(data.events).toEqual([]);
    expect(data.appState.view).toBe("month");
    expect(data.appState.displayMode).toBe("calendar");
  });

  it("Should normalize invalid event and app state values", () => {
    const data = normalizeCalendarNodeData({
      version: 999,
      events: [
        {
          id: "event-1",
          title: " Planning ",
          startDate: "2026-05-14",
          endDate: "2026-05-14",
          startTime: "10:00",
          endTime: "11:00",
          color: "teal",
          isAllDay: false,
        },
        {
          title: "Missing date",
        },
      ],
      appState: {
        currentMonth: 99,
        currentYear: 2026,
        selectedDay: 40,
        view: "agenda",
        displayMode: "timeline",
        filterColors: ["teal", "unknown"],
      },
    });

    expect(data.version).toBe(1);
    expect(data.events).toHaveLength(1);
    expect(data.events[0]).toMatchObject({
      id: "event-1",
      title: "Planning",
      color: "teal",
    });
    expect(data.appState.currentMonth).toBe(11);
    expect(data.appState.selectedDay).toBe(31);
    expect(data.appState.view).toBe("month");
    expect(data.appState.displayMode).toBe("calendar");
    expect(data.appState.filterColors).toEqual(["teal"]);
  });

  it("Should round-trip serialized calendar data", () => {
    const serialized = serializeCalendarNodeData({
      ...createDefaultCalendarNodeData(),
      events: [
        {
          id: "event-1",
          title: "Release",
          description: "Ship the first calendar block",
          startDate: "2026-05-14",
          endDate: "2026-05-14",
          startTime: "09:00",
          endTime: "10:00",
          color: "blue",
          isAllDay: false,
        },
      ],
    });

    expect(normalizeCalendarNodeData(serialized).events[0]?.title).toBe(
      "Release",
    );
  });
});
