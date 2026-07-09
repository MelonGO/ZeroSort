import { formatTime, getOffsetFromTime } from "@/lib/calendar/calendar-utils";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface CurrentTimeIndicatorProps {
  enabled: boolean;
  hourHeight: number;
  use24Hour: boolean;
  totalHours?: number;
}

export function CurrentTimeIndicator({
  enabled,
  hourHeight,
  use24Hour,
  totalHours = 24,
}: CurrentTimeIndicatorProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const syncNow = () => {
      setNow(new Date());
    };

    syncNow();

    const intervalId = window.setInterval(syncNow, 60000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  const currentTimeOffset = getOffsetFromTime(currentTime, hourHeight);

  if (currentTimeOffset < 0 || currentTimeOffset > totalHours * hourHeight) {
    return null;
  }

  const currentTimeLabel = formatTime(currentTime, use24Hour);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-15"
      style={{ top: `${currentTimeOffset}px` }}
      aria-label={t("event-calendar.calendar.currentTime", {
        time: currentTimeLabel,
      })}
    >
      <div className="relative h-0">
        <span className="absolute left-1 -translate-y-1/2 rounded bg-destructive px-1.5 py-0.5 text-[11px] font-semibold leading-none text-destructive-foreground shadow-sm">
          {currentTimeLabel}
        </span>
        <div className="h-0.5 w-full bg-destructive" />
      </div>
    </div>
  );
}
