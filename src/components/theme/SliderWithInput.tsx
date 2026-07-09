import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useEffect, useState } from "react";

interface SliderWithInputProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  label: string;
  unit?: string;
}

/** A combined slider and number input control. */
function SliderWithInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  unit = "px",
}: SliderWithInputProps) {
  const [localValue, setLocalValue] = useState(value.toString());

  useEffect(() => {
    setLocalValue(value.toString());
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setLocalValue(raw);
    const num = parseFloat(raw.replace(",", "."));
    if (!isNaN(num)) {
      onChange(Math.max(min, Math.min(max, num)));
    }
  };

  const inputId = `slider-${label.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center justify-between">
        <Label htmlFor={inputId} className="text-xs font-medium">
          {label}
        </Label>
        <div className="flex items-center gap-1">
          <Input
            id={`input-${label.replace(/\s+/g, "-").toLowerCase()}`}
            type="number"
            value={localValue}
            onChange={handleInputChange}
            onBlur={() => setLocalValue(value.toString())}
            min={min}
            max={max}
            step={step}
            className="h-6 w-18 px-2 text-xs"
          />
          <span className="text-xs text-muted-foreground">{unit}</span>
        </div>
      </div>
      <Slider
        id={inputId}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(values) => {
          const newValue = values[0];
          setLocalValue(newValue.toString());
          onChange(newValue);
        }}
        className="py-1"
      />
    </div>
  );
}

export { SliderWithInput };
