import {
  getOffsetFromTime,
  getTimeFromGridOffset,
} from "@/lib/calendar/calendar-utils";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from "react";

interface UseTimeGridSelectionOptions {
  hourHeight: number;
  railWidth: number;
  onTimeSelect: (time: string) => void;
}

interface UseTimeGridSelectionResult {
  gridRef: RefObject<HTMLDivElement | null>;
  manualTimeOffset: number;
  selectedTime: string;
  isManualDragging: boolean;
  showManualTimeIndicator: boolean;
  handleGridPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  handleGridPointerLeave: () => void;
  handleManualPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  handleManualPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  handleManualPointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
  handleManualPointerCancel: (event: PointerEvent<HTMLButtonElement>) => void;
}

export function useTimeGridSelection({
  hourHeight,
  railWidth,
  onTimeSelect,
}: UseTimeGridSelectionOptions): UseTimeGridSelectionResult {
  const [manualTimeOffset, setManualTimeOffset] = useState(() => {
    const initialNow = new Date();
    const initialTime = `${initialNow.getHours().toString().padStart(2, "0")}:${initialNow.getMinutes().toString().padStart(2, "0")}`;
    return getOffsetFromTime(initialTime, hourHeight);
  });
  const [isTimeRailHovered, setIsTimeRailHovered] = useState(false);
  const [isManualDragging, setIsManualDragging] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const didDragRef = useRef(false);
  const onTimeSelectRef = useRef(onTimeSelect);

  useEffect(() => {
    onTimeSelectRef.current = onTimeSelect;
  }, [onTimeSelect]);

  const selectedTime = useMemo(
    () => getTimeFromGridOffset(manualTimeOffset, hourHeight),
    [hourHeight, manualTimeOffset],
  );
  const showManualTimeIndicator = isTimeRailHovered || isManualDragging;

  const isPointerInTimeRail = useCallback(
    (clientX: number, clientY: number) => {
      const rect = gridRef.current?.getBoundingClientRect();
      if (!rect) {
        return false;
      }

      const isWithinVerticalBounds =
        clientY >= rect.top && clientY <= rect.bottom;
      const horizontalOffset = clientX - rect.left;

      return (
        isWithinVerticalBounds &&
        horizontalOffset >= 0 &&
        horizontalOffset <= railWidth
      );
    },
    [railWidth],
  );

  const updateOffsetFromClientY = useCallback((clientY: number) => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    setManualTimeOffset(clientY - rect.top);
  }, []);

  const handleGridPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const isHoveringTimeRail = isPointerInTimeRail(
        event.clientX,
        event.clientY,
      );

      if (isHoveringTimeRail) {
        if (!isTimeRailHovered) {
          setIsTimeRailHovered(true);
        }

        if (!isManualDragging) {
          updateOffsetFromClientY(event.clientY);
        }
        return;
      }

      if (!isManualDragging && isTimeRailHovered) {
        setIsTimeRailHovered(false);
      }
    },
    [
      isManualDragging,
      isPointerInTimeRail,
      isTimeRailHovered,
      updateOffsetFromClientY,
    ],
  );

  const handleGridPointerLeave = useCallback(() => {
    if (!isManualDragging) {
      setIsTimeRailHovered(false);
    }
  }, [isManualDragging]);

  const handleManualPointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      didDragRef.current = false;
      setIsManualDragging(true);
      setIsTimeRailHovered(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      updateOffsetFromClientY(event.clientY);
    },
    [updateOffsetFromClientY],
  );

  const handleManualPointerMove = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        return;
      }

      didDragRef.current = true;
      updateOffsetFromClientY(event.clientY);
    },
    [updateOffsetFromClientY],
  );

  const handleManualPointerUp = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      setIsManualDragging(false);
      if (!didDragRef.current) {
        onTimeSelectRef.current(selectedTime);
      }
    },
    [selectedTime],
  );

  const handleManualPointerCancel = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      setIsManualDragging(false);
    },
    [],
  );

  return {
    gridRef,
    manualTimeOffset,
    selectedTime,
    isManualDragging,
    showManualTimeIndicator,
    handleGridPointerMove,
    handleGridPointerLeave,
    handleManualPointerDown,
    handleManualPointerMove,
    handleManualPointerUp,
    handleManualPointerCancel,
  };
}
