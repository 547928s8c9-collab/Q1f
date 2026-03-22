import { Button } from "@/components/ui/button";

export type RangeOption = "7D" | "30D" | "90D" | "1Y" | "ALL";

interface RangeSelectorProps {
  value: RangeOption;
  onChange: (value: RangeOption) => void;
}

const options: RangeOption[] = ["7D", "30D", "90D", "1Y", "ALL"];

const RANGE_LABELS: Record<RangeOption, string> = {
  "7D": "7Д",
  "30D": "30Д",
  "90D": "90Д",
  "1Y": "1Г",
  "ALL": "ВСЕ",
};

export function rangeToDays(range: RangeOption): number {
  switch (range) {
    case "7D":
      return 7;
    case "30D":
      return 30;
    case "90D":
      return 90;
    case "1Y":
      return 365;
    case "ALL":
      return 9999;
    default:
      return 30;
  }
}

export function RangeSelector({ value, onChange }: RangeSelectorProps) {
  return (
    <div className="flex flex-wrap gap-1" data-testid="range-selector">
      {options.map((option) => (
        <Button
          key={option}
          variant={value === option ? "default" : "ghost"}
          onClick={() => onChange(option)}
          data-testid={`range-option-${option.toLowerCase()}`}
        >
          {RANGE_LABELS[option]}
        </Button>
      ))}
    </div>
  );
}
