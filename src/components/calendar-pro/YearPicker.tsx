import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";

interface YearPickerProps {
  value: number;
  onChange: (year: number) => void;
  className?: string;
}

export function YearPicker({ value, onChange, className }: YearPickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-10 w-25 justify-center rounded-xl font-semibold",
            className,
          )}
          aria-label="Select year"
        >
          {value}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="flex w-30 flex-col items-center gap-1 rounded-2xl border-border/80 p-2 shadow-xl sm:w-35"
        align="center"
        sideOffset={8}
      >
        <Button
          variant="ghost"
          size="icon"
          className="flex h-9 w-full items-center justify-center sm:h-8"
          onClick={() => onChange(value + 1)}
        >
          <ChevronUp className="size-[18px]" strokeWidth={2.5} />
        </Button>
        <div className="flex h-11 w-full items-center justify-center rounded-lg border border-gray-200 text-base font-bold shadow-sm sm:text-lg">
          {value}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="flex h-9 w-full items-center justify-center sm:h-8"
          onClick={() => onChange(value - 1)}
        >
          <ChevronDown className="size-[18px]" strokeWidth={2.5} />
        </Button>
      </PopoverContent>
    </Popover>
  );
}
